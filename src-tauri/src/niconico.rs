use futures_util::{SinkExt, StreamExt};
use prost::Message;
use regex::Regex;
use reqwest::header::USER_AGENT;
use serde::Serialize;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::protocol::Message as WsMessage;

// Include generated proto
pub mod ndgr {
    include!(concat!(env!("OUT_DIR"), "/dwango.nicolive.chat.service.edge.rs"));
}

#[derive(Clone, Serialize)]
struct CommentEvent {
    author: String,
    message: String,
}

#[derive(Clone, Serialize)]
struct SystemEvent {
    author: String,
    message: String,
}

pub struct NiconicoClient {
    running: Arc<AtomicBool>,
    app_handle: AppHandle,
}

impl NiconicoClient {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            app_handle,
        }
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
    }

    pub fn start(&self, url: String) {
        if self.running.load(Ordering::Relaxed) {
            return;
        }
        self.running.store(true, Ordering::Relaxed);
        let running_flag = self.running.clone();
        let app = self.app_handle.clone();

        tokio::spawn(async move {
            if let Err(e) = connect_and_run(url, app.clone(), running_flag.clone()).await {
                // emit error
                let _ = app.emit("comment", SystemEvent {
                    author: "System".into(),
                    message: format!("Error: {}", e),
                });
            }
            running_flag.store(false, Ordering::Relaxed);
        });
    }
}

use std::collections::HashSet;
use std::sync::Mutex;

async fn connect_and_run(url: String, app: AppHandle, running: Arc<AtomicBool>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let client = reqwest::Client::new();
    
    // 1. Fetch Page
    let res = client.get(&url)
        .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .send().await?.text().await?;

    // 2. Extract Props
    let re_script = Regex::new(r#"<script[^>]+id="embedded-data"[^>]*>([\s\S]*?)</script>"#).unwrap();
    let re_attr = Regex::new(r#"data-props="([^"]+)""#).unwrap();

    let props_str = if let Some(caps) = re_script.captures(&res) {
        let content = caps[1].trim().to_string();
        if !content.is_empty() {
             app.emit("comment", SystemEvent { author: "System".into(), message: "Found embedded-data in script tag".into() })?;
             content
        } else {
             // Fallback to attribute if script body is empty
             if let Some(caps_attr) = re_attr.captures(&res) {
                 app.emit("comment", SystemEvent { author: "System".into(), message: "Found embedded-data in data-props attribute (fallback)".into() })?;
                 urlencoding::decode(&caps_attr[1])?.replace("&quot;", "\"")
             } else {
                 return Err("Found script tag but no content and no data-props".into());
             }
        }
    } else if let Some(caps) = re_attr.captures(&res) {
        app.emit("comment", SystemEvent { author: "System".into(), message: "Found embedded-data in data-props attribute".into() })?;
        urlencoding::decode(&caps[1])?.replace("&quot;", "\"")
    } else {
        return Err("Could not find embedded-data".into());
    };
    

    let props: Value = match serde_json::from_str(&props_str) {
        Ok(v) => v,
        Err(e) => {
            let snippet = if props_str.len() > 200 { &props_str[..200] } else { &props_str };
            app.emit("comment", SystemEvent { author: "Fatal".into(), message: format!("JSON Parse Error: {} | Content: {}", e, snippet) })?;
            return Err(Box::new(e));
        }
    };
    let ws_url = props["site"]["relive"]["webSocketUrl"].as_str().ok_or("No WebSocket URL")?;
    
    app.emit("comment", SystemEvent { author: "System".into(), message: "WebSocket URL found".into() })?;

    // 3. Connect WebSocket
    let (ws_stream, _) = connect_async(ws_url).await?;
    let (mut write, mut read) = ws_stream.split();

    // Send startWatching
    let start_watching = serde_json::json!({
        "type": "startWatching",
        "data": {
            "stream": {
                "quality": "super_high",
                "latency": "low",
                "chasePlay": false
            },
            "reconnect": false
        }
    });

    write.send(WsMessage::Text(start_watching.to_string())).await?;

    let mut view_uri = String::new();

    // Listen for MessageServer
    while let Some(msg) = read.next().await {
        if !running.load(Ordering::Relaxed) { return Ok(()); }
        let msg = msg?;
        if let WsMessage::Text(text) = msg {
            let json: Value = serde_json::from_str(&text)?;
            if json["type"] == "ping" {
                write.send(WsMessage::Text(serde_json::json!({"type": "pong"}).to_string())).await?;
            } else if json["type"] == "messageServer" {
                view_uri = json["data"]["viewUri"].as_str().unwrap_or("").to_string();
                break;
            } else if json["type"] == "stream" {
                 // Fallback if messageServer not received immediately, but usually messageServer comes first or soon.
                 // If we get stream uri, we can use it as fallback?
                 if let Some(uri) = json["data"]["uri"].as_str() {
                     if view_uri.is_empty() {
                         view_uri = uri.to_string();
                     }
                 }
            }
        }
    }

    if view_uri.is_empty() {
         // Maybe continue reading loop?
         // For now, assume failure if loop broke without URI
         // Re-implement read loop closer to real logic?
         return Err("No View URI received".into());
    }

    app.emit("comment", SystemEvent { author: "System".into(), message: "Connected to Message Server".into() })?;

    // 4. Entry Loop
    let mut current_at = "now".to_string();
    // Cache for deduplication
    let seen_ids = Arc::new(Mutex::new(HashSet::new()));

    while running.load(Ordering::Relaxed) {
        let separator = if view_uri.contains("?") { "&" } else { "?" };
        // Better:
        let uri = format!("{}{}at={}", view_uri, separator, current_at);
        
        let mut resp = client.get(&uri).send().await?;
        
        // Stream body
        let mut buffer = temp_niconama::Buffer::new();
        
        while let Some(chunk) = resp.chunk().await? {
            if !running.load(Ordering::Relaxed) { break; }
            buffer.extend_from_slice(&chunk);
            
            // Decode loop
            while let Some(entry) = buffer.decode_next::<ndgr::ChunkedEntry>() {
                if let Some(entry_data) = entry.entry {
                    match entry_data {
                        ndgr::chunked_entry::Entry::Next(next) => {
                           current_at = next.at.to_string();
                        },
                        ndgr::chunked_entry::Entry::Segment(seg) => {
                             let seg_uri = seg.uri;
                             let app_clone = app.clone();
                             let client_clone = client.clone();
                             let seen_ids_clone = seen_ids.clone();
                             tokio::spawn(async move {
                                 if let Err(e) = fetch_segment(client_clone, seg_uri, app_clone.clone(), seen_ids_clone).await {
                                     // Log error inside spawn
                                     let _ = app_clone.emit("comment", SystemEvent { author: "Debug".into(), message: format!("Segment Error: {}", e) }); 
                                 }
                             });
                        },
                        ndgr::chunked_entry::Entry::Previous(_prev) => {
                             // Ignore previous segments to reduce latency and focus on live comments for now.
                             // let seg_uri = prev.uri;
                             // ... spawn ...
                        },
                         _ => {}
                    }
                }
            }
        }
    }

    Ok(())
}

async fn fetch_segment(client: reqwest::Client, uri: String, app: AppHandle, seen_ids: Arc<Mutex<HashSet<String>>>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut resp = client.get(&uri).send().await?;
    
    // Stream processing instead of wait-for-all
    let mut buffer = temp_niconama::Buffer::new();
    
    while let Some(chunk) = resp.chunk().await? {
        buffer.extend_from_slice(&chunk);
        
        while let Some(msg) = buffer.decode_next::<ndgr::ChunkedMessage>() {
             // Deduplication
             if let Some(meta) = &msg.meta {
                 let mut ids = seen_ids.lock().unwrap();
                 if ids.contains(&meta.id) {
                     continue;
                 }
                 ids.insert(meta.id.clone());
             }
             
             if let Some(payload) = msg.payload {
                 match payload {
                     ndgr::chunked_message::Payload::Message(nico_msg) => {
                         if let Some(data) = nico_msg.data {
                             match data {
                                 ndgr::nicolive_message::Data::Chat(chat) => {
                                     let name = if !chat.name.is_empty() {
                                         chat.name
                                     } else if !chat.hashed_user_id.is_empty() {
                                         chat.hashed_user_id
                                     } else {
                                         "Anonymous".to_string()
                                     };
                                     let _ = app.emit("comment", CommentEvent {
                                         author: name,
                                         message: chat.content,
                                     });
                                 },
                                 _ => {}
                             }
                         }
                     },
                     _ => {}
                 }
             }
        }
    }
    
    Ok(())
}

// Helper module for buffer and varint decoding
mod temp_niconama {
    use prost::Message;
    
    pub struct Buffer {
        data: Vec<u8>,
    }
    
    impl Buffer {
        pub fn new() -> Self {
            Self { data: Vec::new() }
        }
        
        pub fn extend_from_slice(&mut self, other: &[u8]) {
            self.data.extend_from_slice(other);
        }
        
        pub fn decode_next<T: Message + Default>(&mut self) -> Option<T> {
             // Try to read a length prefix (varint)
             // Simple varint reader implementation
             let mut i = 0;
             let mut len: u64 = 0;
             let mut shift = 0;
             
             loop {
                 if i >= self.data.len() { return None; } // Not enough bytes
                 let b = self.data[i];
                 len |= ((b & 0x7F) as u64) << shift;
                 shift += 7;
                 i += 1;
                 if b & 0x80 == 0 { break; }
             }
             
             let msg_len = len as usize;
             if self.data.len() < i + msg_len {
                 return None; // Waiting for more data
             }
             
             // Decode
             let msg_buf = &self.data[i..i+msg_len];
             let msg = T::decode(msg_buf).ok();
             
             // Advance buffer
             self.data.drain(0..i+msg_len);
             
             msg
        }
    }
}

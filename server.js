import express from 'express';
import cors from 'cors';
import { LiveChat } from 'youtube-chat';
import axios from 'axios';
import protobuf from 'protobufjs';
import fs from 'fs';
import WebSocket from 'ws';
import net from 'net';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const activeChats = new Map();
const messageBuffers = new Map();

// Protobuf Loading
let ndgrRoot;
try {
    protobuf.load('proto/ndgr.proto').then(r => {
        ndgrRoot = r;
        console.log("Protobuf loaded");
    }).catch(console.error);
} catch (e) { console.error("Proto load sync error", e); }

const ensureBuffer = (id) => {
    if (!messageBuffers.has(id)) messageBuffers.set(id, []);
    return messageBuffers.get(id);
}

// --- YouTube Logic (Preserved) ---
app.post('/api/youtube/join', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        let id = '';
        if (url.match(/^[a-zA-Z0-9_-]{11}$/)) id = url;
        else {
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('youtube.com')) {
                if (urlObj.searchParams.has('v')) id = urlObj.searchParams.get('v');
                else if (urlObj.pathname.startsWith('/live/')) id = urlObj.pathname.split('/live/')[1];
            } else if (urlObj.hostname === 'youtu.be') id = urlObj.pathname.slice(1);
        }
        if (!id || id.length !== 11) return res.status(400).json({ error: 'Invalid ID' });
        if (activeChats.has(id)) return res.json({ status: 'already_joined', id });

        console.log(`Starting YT: ${id}`);
        const liveChat = new LiveChat({ liveId: id });
        const buffer = ensureBuffer(id);

        liveChat.on('chat', (chatItem) => {
            buffer.push({
                id: chatItem.id,
                author: chatItem.author.name,
                message: chatItem.message,
                timestamp: chatItem.timestamp
            });
            if (buffer.length > 500) buffer.shift();
        });
        const ok = await liveChat.start();
        if (!ok) return res.status(500).json({ error: 'YT Connect Failed' });
        activeChats.set(id, { stop: () => liveChat.stop() });
        res.json({ status: 'joined', id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/youtube/messages', (req, res) => {
    const { id } = req.query;
    if (!id || !messageBuffers.has(id)) return res.json([]);
    const buffer = messageBuffers.get(id);
    const messages = [...buffer];
    buffer.length = 0;
    res.json(messages);
});

// --- Niconico Logic ---

app.post('/api/niconico/join', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    console.log(`[Niconico] Joining ${url}`);

    try {
        const pageRes = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        const html = pageRes.data;
        let props;
        const match = html.match(/id="embedded-data".*?data-props="([^"]+)"/);
        if (match) props = JSON.parse(decodeURIComponent(match[1]).replace(/&quot;/g, '"'));
        else {
            const jsonMatch = html.match(/<script id="embedded-data" type="application\/json">([\s\S]*?)<\/script>/);
            if (jsonMatch) props = JSON.parse(jsonMatch[1]);
            else return res.status(500).json({ error: 'No embedded-data' });
        }

        const liveId = props.program?.nicoliveProgramId || 'unknown';
        const wsUrl = props.site?.relive?.webSocketUrl;
        if (!wsUrl) return res.status(500).json({ error: 'No WebSocket URL' });

        if (activeChats.has(liveId)) return res.json({ status: 'joined', id: liveId });

        const buffer = ensureBuffer(liveId);
        console.log(`[Niconico] WS: ${wsUrl}`);
        const ws = new WebSocket(wsUrl);
        let ndgrStarted = false;

        ws.on('open', () => {
            console.log(`[Niconico] Connected WS ${liveId}`);
            // Try asking for BOTH stream and room (Hybrid/Legacy intent)
            ws.send(JSON.stringify({
                "type": "startWatching",
                "data": {
                    "stream": { "quality": "super_high", "protocol": "hls", "latency": "low", "chasePlay": false },
                    "room": { "protocol": "webSocket", "commentable": true },
                    "reconnect": false
                }
            }));
            buffer.push({ id: 'sys-ws', author: 'System', message: 'WS Connected. sending startWatching...', timestamp: Date.now() });
        });

        ws.on('message', (data) => {
            try {
                const json = JSON.parse(data.toString());

                // Debug Log for Critical Types
                if (['stream', 'room', 'messageServer'].includes(json.type)) {
                    console.log(`[WS] ${json.type} DATA:`, JSON.stringify(json.data, null, 2));
                }

                let viewUri = null;
                if (json.type === 'messageServer' && json.data?.viewUri) {
                    viewUri = json.data.viewUri;
                }
                // DO NOT FALLBACK TO STREAM URI (.m3u8) - IT IS VIDEO

                if (viewUri && !ndgrStarted) {
                    console.log(`[Niconico] Found MSG SERVER URI: ${viewUri}`);
                    buffer.push({ id: 'sys-entry', author: 'System', message: 'Found MessageServer. Connecting...', timestamp: Date.now() });
                    startEntryStream(viewUri, liveId, buffer);
                    ndgrStarted = true;
                }

                if (json.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));

            } catch (e) {
                console.error("WS Parse Error", e);
            }
        });

        ws.on('close', () => {
            console.log(`[Niconico] WS Closed ${liveId}`);
            activeChats.delete(liveId);
        });

        activeChats.set(liveId, { stop: () => ws.close() });
        res.json({ status: 'joined', id: liveId });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/niconico/messages', (req, res) => {
    const { id } = req.query;
    if (!id || !messageBuffers.has(id)) return res.json([]);
    const buffer = messageBuffers.get(id);
    const messages = [...buffer];
    buffer.length = 0;
    res.json(messages);
});

async function startEntryStream(viewUri, liveId, buffer) {
    if (!ndgrRoot) return;

    // safe append ?at=now
    const separator = viewUri.includes('?') ? '&' : '?';
    const uri = `${viewUri}${separator}at=now`;
    console.log(`[Entry] Fetching: ${uri}`);

    try {
        const response = await axios({
            method: 'get',
            url: uri,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Origin': 'https://live.nicovideo.jp',
                'Referer': 'https://live.nicovideo.jp/'
            }
        });

        const stream = response.data;
        const ChunkedEntry = ndgrRoot.lookupType("dwango.nicolive.chat.service.edge.ChunkedEntry");

        let headerBuffer = Buffer.alloc(0);

        stream.on('data', (chunk) => {
            let data = chunk;
            if (headerBuffer.length > 0) {
                data = Buffer.concat([headerBuffer, chunk]);
                headerBuffer = Buffer.alloc(0);
            }

            let offset = 0;
            while (offset < data.length) {
                let length = 0; let shift = 0; let i = offset; let hasLength = false;
                while (i < data.length) {
                    const byte = data[i];
                    length |= (byte & 0x7F) << shift;
                    shift += 7;
                    i++;
                    if ((byte & 0x80) === 0) { hasLength = true; break; }
                }

                if (!hasLength) { headerBuffer = data.slice(offset); break; }
                if (data.length - i >= length) {
                    const payload = data.slice(i, i + length);
                    offset = i + length;
                    try {
                        const entryMsg = ChunkedEntry.decode(payload);
                        const entry = ChunkedEntry.toObject(entryMsg, { longs: String, enums: String, bytes: String });

                        if (entry.segment && entry.segment.uri) {
                            console.log(`[Entry] Got Segment URI: ${entry.segment.uri}`);
                            startMessageStream(entry.segment.uri, liveId, buffer);
                        }
                    } catch (e) {
                        // console.error("Entry Decode Error", e.message); 
                    }
                } else { headerBuffer = data.slice(offset); break; }
            }
        });

        stream.on('error', e => console.error("[Entry] Error", e.message));

    } catch (e) {
        console.error("[Entry] Connection Failed", e.message);
        buffer.push({ id: 'err-entry', author: 'System', message: `Entry Error: ${e.response?.status}`, timestamp: Date.now() });
    }
}

async function startMessageStream(messageUri, liveId, buffer) {
    try {
        const response = await axios({
            method: 'get',
            url: messageUri,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Origin': 'https://live.nicovideo.jp',
                'Referer': 'https://live.nicovideo.jp/'
            }
        });

        const stream = response.data;
        const ChunkedMessage = ndgrRoot.lookupType("dwango.nicolive.chat.service.edge.ChunkedMessage");

        let headerBuffer = Buffer.alloc(0);

        stream.on('data', (chunk) => {
            let data = chunk;
            if (headerBuffer.length > 0) {
                data = Buffer.concat([headerBuffer, chunk]);
                headerBuffer = Buffer.alloc(0);
            }
            let offset = 0;
            while (offset < data.length) {
                let length = 0; let shift = 0; let i = offset; let hasLength = false;
                while (i < data.length) {
                    const byte = data[i];
                    length |= (byte & 0x7F) << shift;
                    shift += 7;
                    i++;
                    if ((byte & 0x80) === 0) { hasLength = true; break; }
                }
                if (!hasLength) { headerBuffer = data.slice(offset); break; }
                if (data.length - i >= length) {
                    const payload = data.slice(i, i + length);
                    offset = i + length;
                    try {
                        const msg = ChunkedMessage.decode(payload);
                        const obj = ChunkedMessage.toObject(msg, { longs: String, enums: String, bytes: String });
                        if (obj.payload && obj.payload.message && obj.payload.message.data && obj.payload.message.data.chat) {
                            const chat = obj.payload.message.data.chat;
                            const userId = chat.hashedUserId || chat.rawUserId || 'User';
                            if (chat.content) {
                                buffer.push({
                                    id: chat.no ? String(chat.no) : String(Date.now()),
                                    author: chat.name || userId,
                                    message: chat.content,
                                    timestamp: Date.now()
                                });
                                if (buffer.length > 500) buffer.shift();
                            }
                        }
                    } catch (e) { }
                } else { headerBuffer = data.slice(offset); break; }
            }
        });
        stream.on('error', e => console.error("[Msg] Error", e.message));

    } catch (e) {
        console.error("[Msg] Connection Failed", e.message);
        buffer.push({ id: 'err-msg', author: 'System', message: `Msg Error: ${e.response?.status}`, timestamp: Date.now() });
    }
}


// --- Bouyomi-chan Proxy (HTTP) ---
app.post('/api/speak', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    console.log(`[Bouyomi] Speaking: ${text.substring(0, 50)}...`);

    try {
        // Bouyomi-chan HTTP API: http://localhost:50080/talk?text=...
        await axios.get('http://localhost:50080/talk?text=' + text);
        res.json({ status: 'ok' });
    } catch (e) {
        console.error("[Bouyomi] HTTP Error:", e.message);
        res.json({ status: 'error', error: e.message });
    }
});


app.listen(port, () => {
    console.log(`YouTube Chat Proxy Server running at http://localhost:${port}`);
});

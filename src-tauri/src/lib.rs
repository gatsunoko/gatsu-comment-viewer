mod niconico;
use std::sync::Mutex;


pub struct NiconicoState {
    client: Mutex<Option<niconico::NiconicoClient>>,
}

#[tauri::command]
async fn connect_niconico(app: tauri::AppHandle, state: tauri::State<'_, NiconicoState>, url: String) -> Result<(), String> {
    let mut client_lock = state.client.lock().map_err(|_| "Failed to lock mutex")?;
    
    // Stop existing if any
    if let Some(client) = client_lock.as_ref() {
        client.stop();
    }
    
    let new_client = niconico::NiconicoClient::new(app);

    
    // Start async task inside the client
    new_client.start(url);
    
    *client_lock = Some(new_client);
    Ok(())
}

#[tauri::command]
fn disconnect_niconico(state: tauri::State<'_, NiconicoState>) -> Result<(), String> {
    let mut client_lock = state.client.lock().map_err(|_| "Failed to lock mutex")?;
    if let Some(client) = client_lock.as_ref() {
        client.stop();
    }
    *client_lock = None;
    Ok(())
}

#[tauri::command]
fn get_exe_dir() -> Result<String, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe_path.parent().ok_or("Failed to get parent dir")?;
    Ok(dir.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_sql::Builder::default().build())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .manage(NiconicoState { client: Mutex::new(None) })
    .invoke_handler(tauri::generate_handler![connect_niconico, disconnect_niconico, get_exe_dir])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

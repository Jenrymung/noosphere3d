mod files;

use files::{
    backup_dir_for, delete_recovery, list_recovery, read_map, save_map, write_recovery, RecoveryRecord, SaveOutcome,
    SaveRequest,
};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

static STARTUP_PATHS: Mutex<Vec<String>> = Mutex::new(Vec::new());

fn map_paths(args: impl IntoIterator<Item = String>) -> Vec<String> {
    args.into_iter()
        .filter(|arg| arg.ends_with(".mindmap3d") && !arg.starts_with('-'))
        .collect()
}

fn recovery_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("recovery");
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn take_startup_paths() -> Vec<String> {
    std::mem::take(&mut STARTUP_PATHS.lock().expect("startup paths"))
}

#[tauri::command]
fn read_map_file(path: String) -> Result<files::ReadResult, String> {
    read_map(std::path::Path::new(&path))
}

#[tauri::command]
fn save_map_file(app: tauri::AppHandle, request: SaveRequest) -> SaveOutcome {
    let path = PathBuf::from(&request.path);
    let app_data = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let backups = backup_dir_for(&app_data, &request.backup_location, &path);
    save_map(
        &path,
        &request.text,
        request.expected.as_ref(),
        Some(&backups),
        request.backup_keep,
        request.rotate_backup,
    )
}

#[tauri::command]
fn write_recovery_file(app: tauri::AppHandle, record: RecoveryRecord) -> Result<SaveOutcome, String> {
    let dir = recovery_root(&app)?;
    Ok(write_recovery(&dir, &record))
}

#[tauri::command]
fn list_recovery_files(app: tauri::AppHandle) -> Result<Vec<RecoveryRecord>, String> {
    list_recovery(&recovery_root(&app)?)
}

#[tauri::command]
fn delete_recovery_file(app: tauri::AppHandle, id: String) -> Result<(), String> {
    delete_recovery(&recovery_root(&app)?, &id)
}

fn deliver_paths(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("open-paths", paths);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup = map_paths(std::env::args().skip(1));
    if !startup.is_empty() {
        *STARTUP_PATHS.lock().expect("startup paths") = startup;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            deliver_paths(app, map_paths(args));
        }))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("close-requested", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_version,
            take_startup_paths,
            read_map_file,
            save_map_file,
            write_recovery_file,
            list_recovery_files,
            delete_recovery_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

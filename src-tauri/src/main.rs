// Release builds open no console window next to the app window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

// The Steam app id of Enshrouded. Steam keeps cloud saves in userdata/<account>/<app id>/remote.
const STEAM_APP_ID: &str = "1203620";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveFile {
    path: String,
    name: String,
    source: &'static str,
    steam_account: Option<String>,
    modified: u64,
}

#[cfg(windows)]
fn registry_steam_dir() -> Option<PathBuf> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let steam = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam").ok()?;
    let path: String = steam.get_value("SteamPath").ok()?;
    Some(PathBuf::from(path))
}

#[cfg(not(windows))]
fn registry_steam_dir() -> Option<PathBuf> {
    None
}

fn steam_dir() -> Option<PathBuf> {
    registry_steam_dir()
        .into_iter()
        .chain([PathBuf::from("C:\\Program Files (x86)\\Steam")])
        .find(|dir| dir.join("userdata").is_dir())
}

// The folders the game saves to: one per Steam account with Steam Cloud on, and one shared folder with it off.
fn save_folders() -> Vec<(PathBuf, &'static str, Option<String>)> {
    let mut folders = Vec::new();

    if let Some(steam) = steam_dir() {
        if let Ok(accounts) = std::fs::read_dir(steam.join("userdata")) {
            for account in accounts.flatten() {
                let remote = account.path().join(STEAM_APP_ID).join("remote");
                if remote.is_dir() {
                    folders.push((remote, "steam", Some(account.file_name().to_string_lossy().into_owned())));
                }
            }
        }
    }

    if let Some(profile) = std::env::var_os("USERPROFILE") {
        let local = Path::new(&profile).join("Saved Games").join("keen games").join("Enshrouded");
        if local.is_dir() {
            folders.push((local, "local", None));
        }
    }

    folders
}

// Matches characterN.ksd, but not world saves or the backups in the backup folder.
fn is_character_save(name: &str) -> bool {
    name.strip_prefix("character")
        .and_then(|rest| rest.strip_suffix(".ksd"))
        .is_some_and(|number| !number.is_empty() && number.bytes().all(|byte| byte.is_ascii_digit()))
}

fn find_saves() -> Vec<SaveFile> {
    let mut saves = Vec::new();

    for (folder, source, steam_account) in save_folders() {
        let Ok(entries) = std::fs::read_dir(&folder) else {
            continue;
        };

        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !is_character_save(&name) {
                continue;
            }

            let modified = entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |age| age.as_millis() as u64);

            saves.push(SaveFile {
                path: entry.path().to_string_lossy().into_owned(),
                name,
                source,
                steam_account: steam_account.clone(),
                modified,
            });
        }
    }

    saves.sort_by(|first, second| second.modified.cmp(&first.modified));
    saves
}

#[tauri::command]
fn list_saves() -> Vec<SaveFile> {
    find_saves()
}

// Reads only a file that list_saves returns, so the page cannot read any other file.
#[tauri::command]
fn read_save(path: String) -> Result<tauri::ipc::Response, String> {
    if !find_saves().iter().any(|save| save.path == path) {
        return Err("This file is not a character save in an Enshrouded save folder.".into());
    }

    std::fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|error| format!("The save could not be read: {error}"))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![list_saves, read_save])
        .run(tauri::generate_context!())
        .expect("the app failed to start");
}

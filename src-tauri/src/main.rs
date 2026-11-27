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

// Keeps the folders that exist, and each folder only once, also when it is reached by more than one path,
// such as ~/.steam/steam, which links to Steam's own folder.
fn distinct_dirs(dirs: impl IntoIterator<Item = PathBuf>) -> Vec<PathBuf> {
    let mut seen = Vec::new();
    let mut distinct = Vec::new();

    for dir in dirs {
        let Ok(real) = dir.canonicalize() else {
            continue;
        };
        if !seen.contains(&real) {
            seen.push(real);
            distinct.push(dir);
        }
    }

    distinct
}

#[cfg(windows)]
fn registry_steam_dir() -> Option<PathBuf> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let steam = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam").ok()?;
    let path: String = steam.get_value("SteamPath").ok()?;
    Some(PathBuf::from(path))
}

#[cfg(windows)]
fn steam_candidates() -> Vec<PathBuf> {
    registry_steam_dir().into_iter().chain([PathBuf::from("C:\\Program Files (x86)\\Steam")]).collect()
}

// Steam installed from the distribution's packages, and Steam from Flathub.
#[cfg(target_os = "linux")]
fn steam_candidates() -> Vec<PathBuf> {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return Vec::new();
    };

    vec![
        home.join(".local/share/Steam"),
        home.join(".steam/steam"),
        home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"),
    ]
}

#[cfg(not(any(windows, target_os = "linux")))]
fn steam_candidates() -> Vec<PathBuf> {
    Vec::new()
}

fn steam_dirs() -> Vec<PathBuf> {
    distinct_dirs(steam_candidates().into_iter().filter(|dir| dir.join("userdata").is_dir()))
}

// The Saved Games folder, which Windows lets the user move to another drive or into OneDrive.
#[cfg(windows)]
fn known_saved_games_dir() -> Option<PathBuf> {
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::System::Com::CoTaskMemFree;
    use windows_sys::Win32::UI::Shell::{FOLDERID_SavedGames, SHGetKnownFolderPath, KF_FLAG_DEFAULT};

    let mut path = std::ptr::null_mut();
    // SAFETY: the out pointer is valid, and Windows allocates the string, which is freed below on success and failure.
    let result = unsafe { SHGetKnownFolderPath(&FOLDERID_SavedGames, KF_FLAG_DEFAULT as _, std::ptr::null_mut(), &mut path) };

    let folder = (result >= 0 && !path.is_null()).then(|| {
        // SAFETY: on success the path is a null-terminated wide string.
        let length = (0..).take_while(|&index| unsafe { *path.add(index) } != 0).count();
        let wide = unsafe { std::slice::from_raw_parts(path, length) };
        PathBuf::from(std::ffi::OsString::from_wide(wide))
    });

    unsafe { CoTaskMemFree(path as _) };
    folder
}

#[cfg(windows)]
fn saved_games_dir() -> Option<PathBuf> {
    known_saved_games_dir().or_else(|| std::env::var_os("USERPROFILE").map(|profile| Path::new(&profile).join("Saved Games")))
}

#[cfg(windows)]
fn local_save_dirs(_steam_dirs: &[PathBuf]) -> Vec<PathBuf> {
    saved_games_dir().map(|dir| dir.join("keen games").join("Enshrouded")).into_iter().collect()
}

// The Steam libraries: Steam's own folder and the ones listed in libraryfolders.vdf, such as a second drive.
#[cfg(target_os = "linux")]
fn steam_libraries(steam: &Path) -> Vec<PathBuf> {
    let mut libraries = vec![steam.to_path_buf()];

    if let Ok(text) = std::fs::read_to_string(steam.join("steamapps").join("libraryfolders.vdf")) {
        // A library line looks like: "path"		"/mnt/games/SteamLibrary"
        for line in text.lines() {
            let mut fields = line.split('"').filter(|field| !field.trim().is_empty());
            if fields.next() == Some("path") {
                if let Some(path) = fields.next() {
                    libraries.push(PathBuf::from(path.replace("\\\\", "\\")));
                }
            }
        }
    }

    libraries
}

// Under Proton, the game keeps its Saved Games folder in a Windows prefix in the library it is installed in.
#[cfg(target_os = "linux")]
fn local_save_dirs(steam_dirs: &[PathBuf]) -> Vec<PathBuf> {
    let saves = steam_dirs.iter().flat_map(|steam| steam_libraries(steam)).map(|library| {
        library
            .join("steamapps/compatdata")
            .join(STEAM_APP_ID)
            .join("pfx/drive_c/users/steamuser/Saved Games/keen games/Enshrouded")
    });
    distinct_dirs(saves)
}

#[cfg(not(any(windows, target_os = "linux")))]
fn local_save_dirs(_steam_dirs: &[PathBuf]) -> Vec<PathBuf> {
    Vec::new()
}

// The folders the game saves to: one per Steam account with Steam Cloud on, and one shared folder with it off.
fn save_folders() -> Vec<(PathBuf, &'static str, Option<String>)> {
    let mut folders = Vec::new();
    let steam_dirs = steam_dirs();

    for steam in &steam_dirs {
        if let Ok(accounts) = std::fs::read_dir(steam.join("userdata")) {
            for account in accounts.flatten() {
                let remote = account.path().join(STEAM_APP_ID).join("remote");
                if remote.is_dir() {
                    folders.push((remote, "steam", Some(account.file_name().to_string_lossy().into_owned())));
                }
            }
        }
    }

    for local in local_save_dirs(&steam_dirs) {
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

// WebView2 sometimes shows nothing but the page background until the window is resized,
// although the page has rendered. Growing the window by one pixel and back makes it present the page.
fn nudge_window(window: &tauri::Window) {
    let is_normal = !window.is_maximized().unwrap_or(true) && !window.is_minimized().unwrap_or(true) && !window.is_fullscreen().unwrap_or(true);
    if !is_normal {
        return;
    }

    if let Ok(size) = window.inner_size() {
        let _ = window.set_size(tauri::PhysicalSize::new(size.width + 1, size.height));
        let _ = window.set_size(size);
    }
}

fn main() {
    tauri::Builder::default()
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                nudge_window(&webview.window());
            }
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![list_saves, read_save])
        .run(tauri::generate_context!())
        .expect("the app failed to start");
}

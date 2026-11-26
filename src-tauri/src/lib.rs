//! Loop Lab desktop shell.
//!
//! A native window around the live site, so the app always runs the build
//! Vercel last deployed. The only native behaviour added here is saving
//! downloads (Re-tempo WAV / ZIP exports) into the Downloads folder, which a
//! bare web view would otherwise cancel.

use std::path::{Path, PathBuf};

use tauri::{webview::DownloadEvent, Manager, WebviewWindowBuilder};

/// `name.wav` → `name (2).wav` → `name (3).wav` … until the path is free.
/// A download fails outright if its destination already exists.
pub fn free_path(path: &Path, exists: impl Fn(&Path) -> bool) -> PathBuf {
    if !exists(path) {
        return path.to_path_buf();
    }
    let dir = path.parent().unwrap_or_else(|| Path::new(""));
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("download");
    let ext = path.extension().and_then(|s| s.to_str());
    for n in 2u32.. {
        let name = match ext {
            Some(ext) => format!("{stem} ({n}).{ext}"),
            None => format!("{stem} ({n})"),
        };
        let candidate = dir.join(name);
        if !exists(&candidate) {
            return candidate;
        }
    }
    unreachable!("ran out of download names")
}

/// Where a download should land: inside `downloads` unless the web view
/// already chose an absolute path.
pub fn destination_in(downloads: Option<&Path>, suggested: &Path) -> PathBuf {
    match downloads {
        Some(dir) if !suggested.is_absolute() => {
            dir.join(suggested.file_name().unwrap_or(suggested.as_os_str()))
        }
        _ => suggested.to_path_buf(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let config = app
                .config()
                .app
                .windows
                .first()
                .expect("tauri.conf.json defines the main window")
                .clone();
            let downloads = app.path().download_dir().ok();
            WebviewWindowBuilder::from_config(app.handle(), &config)?
                .on_download(move |_webview, event| {
                    if let DownloadEvent::Requested { destination, .. } = event {
                        let target = destination_in(downloads.as_deref(), destination);
                        *destination = free_path(&target, |p| p.exists());
                    }
                    true
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Loop Lab");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_a_free_name() {
        let p = Path::new("/d/loop.wav");
        assert_eq!(free_path(p, |_| false), PathBuf::from("/d/loop.wav"));
    }

    #[test]
    fn numbers_a_taken_name() {
        let taken = ["/d/loop.wav", "/d/loop (2).wav"];
        let got = free_path(Path::new("/d/loop.wav"), |p| taken.contains(&p.to_str().unwrap()));
        assert_eq!(got, PathBuf::from("/d/loop (3).wav"));
    }

    #[test]
    fn numbers_a_name_without_extension() {
        let got = free_path(Path::new("/d/loops"), |p| p == Path::new("/d/loops"));
        assert_eq!(got, PathBuf::from("/d/loops (2)"));
    }

    #[test]
    fn bare_filenames_go_to_downloads() {
        let got = destination_in(Some(Path::new("/Users/me/Downloads")), Path::new("loop.wav"));
        assert_eq!(got, PathBuf::from("/Users/me/Downloads/loop.wav"));
    }

    #[test]
    fn absolute_destinations_are_left_alone() {
        let got = destination_in(Some(Path::new("/Users/me/Downloads")), Path::new("/tmp/loop.wav"));
        assert_eq!(got, PathBuf::from("/tmp/loop.wav"));
    }
}

use std::process::Stdio;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use std::io::{BufRead, BufReader};
use crate::sidecar::get_sidecar_path;
use crate::utils::new_command;

#[derive(Clone, serde::Serialize)]
struct DownloadProgressPayload {
    pub percent: f64,
}

#[tauri::command]
pub async fn download_video(url: String, app_handle: AppHandle) -> Result<String, String> {
    // Determine a safe temp or cache directory
    let temp_dir = std::env::temp_dir().join("clipmax_downloads");
    if !temp_dir.exists() {
        std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }

    // Resolve sidecar paths
    let ytdlp_path = get_sidecar_path(&app_handle, "yt-dlp")?;
    let ffmpeg_path = get_sidecar_path(&app_handle, "ffmpeg")?;

    // Get parent directory of ffmpeg sidecar to inject in PATH for yt-dlp
    let ffmpeg_dir = ffmpeg_path.parent()
        .ok_or_else(|| "Failed to get ffmpeg parent directory".to_string())?;

    // Inject the ffmpeg sidecar directory at the beginning of the PATH environment variable
    let path_env = std::env::var("PATH").unwrap_or_default();
    #[cfg(target_os = "windows")]
    let separator = ";";
    #[cfg(not(target_os = "windows"))]
    let separator = ":";
    let new_path = format!("{}{}{}", ffmpeg_dir.to_string_lossy(), separator, path_env);

    let output_template = temp_dir.join("%(title)s.%(ext)s");
    let err_file_path = temp_dir.join("yt_dlp_err.log");
    let err_file = std::fs::File::create(&err_file_path).map_err(|e| e.to_string())?;
    
    // Gunakan new_command() agar yt-dlp tidak membuka jendela terminal di Windows
    let mut child = new_command(&ytdlp_path)
        .env("PATH", new_path)
        .args([
            &url,
            "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "-o", &output_template.to_string_lossy(),
            "--no-playlist",
            "--newline",
            "--no-quiet",
            "--print", "after_move:filepath",
            "--ffmpeg-location", &ffmpeg_path.to_string_lossy()
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::from(err_file))
        .spawn()
        .map_err(|e| format!("Failed to execute yt-dlp sidecar: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let reader = BufReader::new(stdout);
    let mut final_filepath = String::new();

    for line in reader.lines() {
        if let Ok(l) = line {
            // yt-dlp output example: [download]  10.0% of ~2.50MiB at  1.00MiB/s ETA 00:02
            if l.contains("[download]") && l.contains("%") {
                let parts: Vec<&str> = l.split_whitespace().collect();
                for part in parts {
                    if part.ends_with("%") {
                        // Strip ANSI codes if any, though usually not there if no tty
                        let clean_part = part.replace("%", "").replace("~", "");
                        if let Ok(percent) = clean_part.parse::<f64>() {
                            let _ = app_handle.emit("download-progress", DownloadProgressPayload { percent });
                        }
                    }
                }
            } else if l.trim().ends_with(".mp4") || l.trim().ends_with(".webm") || l.trim().ends_with(".mkv") || l.trim().ends_with(".mov") {
                final_filepath = l.trim().to_string();
            }
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;

    if status.success() {
        if !final_filepath.is_empty() {
            Ok(final_filepath)
        } else {
            Err("Downloaded, but failed to capture the final file path from output.".into())
        }
    } else {
        let stderr_content = std::fs::read_to_string(&err_file_path).unwrap_or_default();
        Err(format!("yt-dlp error:\n{}", stderr_content))
    }
}

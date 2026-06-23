mod export;
mod downloader;
mod ai;
mod branding;
mod antidup;
mod sidecar;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
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
        .invoke_handler(tauri::generate_handler![
            export::export_clips,
            downloader::download_video,
            ai::analyze_audio_spike,
            ai::extract_and_transcribe,
            ai::analyze_with_openai,
            ai::transcribe_local,
            ai::analyze_with_gemini,
            ai::generate_clip_transcript
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use tauri::AppHandle;
use tauri::Emitter;
use std::path::Path;
use serde::{Deserialize, Serialize};
use crate::sidecar::get_sidecar_path;
use crate::utils::new_command;

fn get_whisper_model_info(model_type: &str) -> (String, u64) {
    match model_type {
        "tiny" => (
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin".to_string(),
            77_691_713, // ~74 MB
        ),
        "small" => (
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin".to_string(),
            487_601_967, // ~465 MB
        ),
        _ => ( // Default to base
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin".to_string(),
            147_951_465, // ~141 MB
        ),
    }
}

fn whisper_model_path(model_type: &str) -> std::path::PathBuf {
    let filename = format!("ggml-{}.bin", if model_type == "tiny" || model_type == "small" { model_type } else { "base" });
    std::env::temp_dir().join(filename)
}

/// Returns true if the Whisper model file already exists on disk.
#[tauri::command]
pub async fn check_whisper_model(model_type: String) -> bool {
    whisper_model_path(&model_type).exists()
}

/// Downloads the Whisper base model and emits `whisper-download-progress` events.
/// Payload: { percent: f32, downloaded_mb: f32, total_mb: f32 }
#[tauri::command]
pub async fn download_whisper_model(model_type: String, app_handle: AppHandle) -> Result<(), String> {
    let model_path = whisper_model_path(&model_type);
    let (model_url, expected_size) = get_whisper_model_info(&model_type);
    let total_mb_expected = expected_size as f64 / 1_048_576.0;

    // Jika file sudah ada, validasi ukurannya agar tidak corrupt.
    // File yang corrupt (hasil download gagal di tengah jalan) akan dihapus dan diunduh ulang.
    if model_path.exists() {
        let actual_size = model_path.metadata().map(|m| m.len()).unwrap_or(0);
        
        // Toleransi ±1MB untuk variasi versi minor
        if actual_size >= expected_size.saturating_sub(1_048_576) {
            // File valid — laporkan selesai
            let _ = app_handle.emit(
                "whisper-download-progress",
                serde_json::json!({ "percent": 100.0, "downloaded_mb": total_mb_expected, "total_mb": total_mb_expected }),
            );
            return Ok(());
        } else {
            // File corrupt/tidak lengkap — hapus dan unduh ulang
            let _ = std::fs::remove_file(&model_path);
            let _ = app_handle.emit(
                "whisper-download-progress",
                serde_json::json!({
                    "percent": 0.0,
                    "downloaded_mb": 0.0,
                    "total_mb": total_mb_expected,
                    "status": "re-downloading"
                }),
            );
        }
    }

    // Start the curl download in a blocking thread so we can poll in parallel.
    let model_path_clone = model_path.clone();
    let download_handle = std::thread::spawn(move || {
        // curl tersedia di Windows 10 1803+ secara bawaan.
        // Gunakan --fail agar curl mengembalikan error jika server merespons error (misal redirect ke HTML)
        new_command("curl")
            .args([
                "-L",           // Ikuti redirect (penting untuk HuggingFace)
                "--fail",       // Gagal jika server merespons HTTP error (bukan binary)
                "--retry", "3", // Coba lagi 3x jika koneksi putus
                "--retry-delay", "2",
                "-o",
                &model_path_clone.to_string_lossy(),
                &model_url,
            ])
            .output()
    });

    // Poll file size every 400ms and emit progress events.
    let total_bytes = expected_size as f64;
    let total_mb = total_mb_expected;

    loop {
        // Check if download thread is done.
        if download_handle.is_finished() {
            break;
        }

        let downloaded_bytes = model_path
            .metadata()
            .map(|m| m.len())
            .unwrap_or(0) as f64;

        let percent = (downloaded_bytes / total_bytes * 100.0).min(99.0); // cap at 99% until confirmed done
        let downloaded_mb = downloaded_bytes / 1_048_576.0;

        let _ = app_handle.emit(
            "whisper-download-progress",
            serde_json::json!({
                "percent": percent,
                "downloaded_mb": downloaded_mb,
                "total_mb": total_mb,
            }),
        );

        std::thread::sleep(std::time::Duration::from_millis(400));
    }

    // Join the thread and check for errors.
    match download_handle.join() {
        Ok(Ok(output)) if output.status.success() => {
            // Validasi akhir: pastikan file yang diunduh ukurannya benar
            let actual_size = model_path.metadata().map(|m| m.len()).unwrap_or(0);
            
            if actual_size < expected_size.saturating_sub(1_048_576) {
                // File corrupt — hapus agar bisa diunduh ulang next time
                let _ = std::fs::remove_file(&model_path);
                return Err(format!(
                    "Download selesai tapi file corrupt (ukuran: {} MB, seharusnya ~{} MB). \
                     Silakan coba klik 'Auto Generate' lagi untuk mengunduh ulang.",
                    actual_size / 1_048_576, total_mb_expected
                ));
            }

            let _ = app_handle.emit(
                "whisper-download-progress",
                serde_json::json!({ "percent": 100.0, "downloaded_mb": total_mb, "total_mb": total_mb }),
            );
            Ok(())
        }
        Ok(Ok(output)) => {
            // curl gagal — hapus file yang mungkin sudah sebagian tertulis
            let _ = std::fs::remove_file(&model_path);
            Err(format!(
                "Download model Whisper gagal. Pastikan koneksi internet stabil.\nDetail: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        },
        Ok(Err(e)) => {
            let _ = std::fs::remove_file(&model_path);
            Err(format!("Gagal menjalankan curl untuk download model: {}.\nPastikan 'curl' tersedia di sistem Anda.", e))
        },
        Err(_) => {
            let _ = std::fs::remove_file(&model_path);
            Err("Download thread mengalami crash. Silakan coba lagi.".to_string())
        },
    }
}


fn to_base64(bytes: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        match chunk.len() {
            3 => {
                result.push(CHARSET[(chunk[0] >> 2) as usize] as char);
                result.push(CHARSET[(((chunk[0] & 0x03) << 4) | (chunk[1] >> 4)) as usize] as char);
                result.push(CHARSET[(((chunk[1] & 0x0F) << 2) | (chunk[2] >> 6)) as usize] as char);
                result.push(CHARSET[(chunk[2] & 0x3F) as usize] as char);
            }
            2 => {
                result.push(CHARSET[(chunk[0] >> 2) as usize] as char);
                result.push(CHARSET[(((chunk[0] & 0x03) << 4) | (chunk[1] >> 4)) as usize] as char);
                result.push(CHARSET[((chunk[1] & 0x0F) << 2) as usize] as char);
                result.push('=');
            }
            1 => {
                result.push(CHARSET[(chunk[0] >> 2) as usize] as char);
                result.push(CHARSET[((chunk[0] & 0x03) << 4) as usize] as char);
                result.push('=');
                result.push('=');
            }
            _ => unreachable!(),
        }
    }
    result
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AIClipResult {
    pub start_time: f64,
    pub end_time: f64,
    pub reason: String,
}

#[tauri::command]
pub async fn analyze_audio_spike(video_path: String, app_handle: AppHandle) -> Result<Vec<AIClipResult>, String> {
    let ffmpeg_path = get_sidecar_path(&app_handle, "ffmpeg")?;

    // Run ffmpeg with silencedetect
    // We detect silence, so the "non-silent" parts are our spikes/clips.
    // noise=-30dB, duration=1s means if audio is louder than -30dB, it's NOT silence.
    let output = new_command(&ffmpeg_path)
        .args([
            "-i", &video_path,
            "-af", "silencedetect=noise=-30dB:d=1",
            "-f", "null",
            "-"
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let mut clips = Vec::new();
    
    // Parse silencedetect output from stderr
    // Example:
    // [silencedetect @ 0x...] silence_start: 10.5
    // [silencedetect @ 0x...] silence_end: 15.0 | silence_duration: 4.5
    
    let mut current_silence_start = 0.0;
    let mut last_silence_end = 0.0; // The end of the previous silence is the start of the loud part

    for line in stderr.lines() {
        if line.contains("silence_start: ") {
            if let Some(start_str) = line.split("silence_start: ").nth(1) {
                if let Ok(start) = start_str.trim().parse::<f64>() {
                    current_silence_start = start;
                    
                    // The loud part is from last_silence_end to current_silence_start
                    if current_silence_start > last_silence_end {
                        let duration = current_silence_start - last_silence_end;
                        // Only add if it's longer than 2 seconds (skip tiny noises)
                        if duration > 2.0 {
                            clips.push(AIClipResult {
                                start_time: last_silence_end,
                                end_time: current_silence_start,
                                reason: "Loud audio detected".to_string(),
                            });
                        }
                    }
                }
            }
        } else if line.contains("silence_end: ") {
            if let Some(end_part) = line.split("silence_end: ").nth(1) {
                if let Some(end_str) = end_part.split(" |").next() {
                    if let Ok(end) = end_str.trim().parse::<f64>() {
                        last_silence_end = end;
                    }
                }
            }
        }
    }

    Ok(clips)
}

#[derive(Serialize, Deserialize)]
pub struct TranscriptionResponse {
    pub text: String,
}

#[tauri::command]
pub async fn extract_and_transcribe(video_path: String, api_key: String, app_handle: AppHandle) -> Result<String, String> {
    let ffmpeg_path = get_sidecar_path(&app_handle, "ffmpeg")?;
    let temp_audio = std::env::temp_dir().join("clipmax_audio.m4a");

    // 1. Extract audio using FFmpeg (32kbps, mono to keep size small for OpenAI < 25MB limit)
    new_command(&ffmpeg_path)
        .args([
            "-y", "-i", &video_path,
            "-vn", "-acodec", "aac", "-b:a", "32k", "-ac", "1",
            &temp_audio.to_string_lossy()
        ])
        .output()
        .map_err(|e| format!("FFmpeg audio extraction failed: {}", e))?;

    // 2. Call OpenAI Whisper API for transcription
    // We will do this via a shell curl command for simplicity, or we can just tell the user we're doing it in React.
    // Actually, doing HTTP requests in Rust requires `reqwest` crate, which might not be in Cargo.toml.
    // Let's use `curl` as a system command to avoid adding heavy dependencies!
    
    let curl_output = new_command("curl")
        .args([
            "https://api.openai.com/v1/audio/transcriptions",
            "-H", &format!("Authorization: Bearer {}", api_key),
            "-F", &format!("file=@{}", temp_audio.to_string_lossy()),
            "-F", "model=whisper-1",
            "-F", "response_format=verbose_json",
            "-F", "timestamp_granularities[]=segment"
        ])
        .output()
        .map_err(|e| format!("Curl gagal dipanggil: {}. Pastikan 'curl' tersedia di sistem Anda (Windows 10 1803+ sudah termasuk curl).", e))?;

    if !curl_output.status.success() {
        return Err(format!("OpenAI API error: {}", String::from_utf8_lossy(&curl_output.stderr)));
    }

    Ok(String::from_utf8_lossy(&curl_output.stdout).to_string())
}

#[tauri::command]
pub async fn analyze_with_openai(transcript: String, api_key: String) -> Result<Vec<AIClipResult>, String> {
    let prompt = format!(
        "You are an expert video editor. Analyze this transcript and find the 3 most engaging, funny, or viral moments. \
        Return ONLY a JSON array of objects, where each object has 'start_time' (float), 'end_time' (float), and 'reason' (string). \
        Transcript: {}", transcript
    );

    let payload = serde_json::json!({
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "You output strict JSON."},
            {"role": "user", "content": prompt}
        ],
        "response_format": { "type": "json_object" }
    });

    let temp_json = std::env::temp_dir().join("clipmax_req.json");
    std::fs::write(&temp_json, payload.to_string()).map_err(|e| e.to_string())?;

    let curl_output = new_command("curl")
        .args([
            "https://api.openai.com/v1/chat/completions",
            "-H", "Content-Type: application/json",
            "-H", &format!("Authorization: Bearer {}", api_key),
            "-d", &format!("@{}", temp_json.to_string_lossy())
        ])
        .output()
        .map_err(|e| format!("Curl gagal dipanggil: {}. Pastikan 'curl' tersedia di sistem Anda.", e))?;

    if !curl_output.status.success() {
        return Err(format!("OpenAI API error: {}", String::from_utf8_lossy(&curl_output.stderr)));
    }

    let response_str = String::from_utf8_lossy(&curl_output.stdout);
    
    // Parse the OpenAI response
    let parsed: serde_json::Value = serde_json::from_str(&response_str).map_err(|e| e.to_string())?;
    
    if let Some(content) = parsed["choices"][0]["message"]["content"].as_str() {
        // Content should be {"clips": [ {start_time, end_time, reason} ]} or similar
        // Try parsing directly as an array of AIClipResult or wrap it.
        let content_val: serde_json::Value = serde_json::from_str(content).map_err(|e| e.to_string())?;
        
        let mut clips = Vec::new();
        
        // Find arrays in the json
        if let Some(arr) = content_val.as_array() {
            for item in arr {
                if let Ok(clip) = serde_json::from_value(item.clone()) {
                    clips.push(clip);
                }
            }
        } else if let Some(arr) = content_val["clips"].as_array() {
             for item in arr {
                if let Ok(clip) = serde_json::from_value(item.clone()) {
                    clips.push(clip);
                }
            }
        }

        return Ok(clips);
    }

    Err("Failed to parse OpenAI response".to_string())
}

#[tauri::command]
pub async fn transcribe_local(video_path: String, model_type: String, app_handle: AppHandle) -> Result<String, String> {
    let ffmpeg_path = get_sidecar_path(&app_handle, "ffmpeg")?;
    let whisper_path = get_sidecar_path(&app_handle, "whisper-cli")?;

    let temp_dir = std::env::temp_dir();
    // Gunakan timestamp sebagai nama unik agar tidak terjadi race condition
    // jika user menekan Auto Generate lebih dari satu kali secara bersamaan
    let unique_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let temp_wav = temp_dir.join(format!("clipmax_audio_{}.wav", unique_id));
    let model_path = whisper_model_path(&model_type);
    
    // Model must already be downloaded by the frontend via download_whisper_model.
    // If it's missing, return a clear error.
    if !model_path.exists() {
        return Err("Model Whisper belum diunduh. Silakan klik 'Start Analysis' lagi untuk mengunduhnya.".to_string());
    }

    // 2. Extract audio to 16kHz WAV
    let ffmpeg_out = new_command(&ffmpeg_path)
        .args([
            "-y", "-i", &video_path,
            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
            "-af", "afftdn,highpass=f=100,lowpass=f=7000,loudnorm",
            &temp_wav.to_string_lossy()
        ])
        .output()
        .map_err(|e| format!("FFmpeg execution failed: {}", e))?;

    if !ffmpeg_out.status.success() {
        return Err(format!("FFmpeg failed: {}", String::from_utf8_lossy(&ffmpeg_out.stderr)));
    }

    // 3. Run whisper-cli sidecar
    let output = new_command(&whisper_path)
        .args([
            "-m", &model_path.to_string_lossy(),
            "-f", &temp_wav.to_string_lossy(),
            "-oj",
            "-l", "id",
            "-of", &temp_wav.to_string_lossy()
        ])
        .output()
        .map_err(|e| format!("whisper-cli failed: {}", e))?;

    if !output.status.success() {
        return Err(format!("whisper-cli error: {}", String::from_utf8_lossy(&output.stderr)));
    }

    // 4. Read the generated JSON
    let json_path = temp_dir.join(format!("clipmax_audio_{}.wav.json", unique_id));
    let transcript = std::fs::read_to_string(&json_path)
        .map_err(|e| format!("Failed to read transcript JSON: {}", e))?;

    // Bersihkan file temp setelah selesai
    let _ = std::fs::remove_file(&temp_wav);
    let _ = std::fs::remove_file(&json_path);

    Ok(transcript)
}

#[tauri::command]
pub async fn analyze_with_gemini(video_path: String, api_key: String, app_handle: AppHandle) -> Result<Vec<AIClipResult>, String> {
    let ffmpeg_path = get_sidecar_path(&app_handle, "ffmpeg")?;
    let temp_audio = std::env::temp_dir().join("clipmax_gemini_audio.m4a");

    // 1. Extract audio using FFmpeg (compressed mono to keep payload small)
    let ffmpeg_out = new_command(&ffmpeg_path)
        .args([
            "-y", "-i", &video_path,
            "-vn", "-acodec", "aac", "-b:a", "32k", "-ac", "1",
            &temp_audio.to_string_lossy()
        ])
        .output()
        .map_err(|e| format!("FFmpeg failed: {}", e))?;

    if !ffmpeg_out.status.success() {
        return Err(format!("FFmpeg audio extraction failed: {}", String::from_utf8_lossy(&ffmpeg_out.stderr)));
    }

    // 2. Base64 encode the audio file using native Rust code
    let audio_bytes = std::fs::read(&temp_audio)
        .map_err(|e| format!("Failed to read temporary audio file: {}", e))?;
    let audio_base64 = to_base64(&audio_bytes);

    // 3. Build Gemini API payload — Gemini can natively understand audio!
    let payload = serde_json::json!({
        "contents": [{
            "parts": [
                {
                    "text": "You are an expert video editor analyzing audio from a video. \
                    Listen carefully and find the 3-5 most engaging, funny, or viral-worthy moments. \
                    Return ONLY a valid JSON object with a 'clips' array. Each element must have: \
                    'start_time' (float, seconds from start), \
                    'end_time' (float, seconds from start), \
                    'reason' (string, short description of why this moment is interesting). \
                    Example: {\"clips\": [{\"start_time\": 12.5, \"end_time\": 25.0, \"reason\": \"Funny reaction\"}]}"
                },
                {
                    "inline_data": {
                        "mime_type": "audio/mp4",
                        "data": audio_base64
                    }
                }
            ]
        }],
        "generationConfig": {
            "response_mime_type": "application/json"
        }
    });

    let temp_json = std::env::temp_dir().join("clipmax_gemini_req.json");
    std::fs::write(&temp_json, payload.to_string()).map_err(|e| e.to_string())?;

    // 4. Call Gemini API
    let api_url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={}",
        api_key
    );

    let curl_output = new_command("curl")
        .args([
            "-s", &api_url,
            "-H", "Content-Type: application/json",
            "-d", &format!("@{}", temp_json.to_string_lossy())
        ])
        .output()
        .map_err(|e| format!("Curl gagal dipanggil: {}. Pastikan 'curl' tersedia di sistem Anda (Windows 10 1803+ sudah termasuk curl).", e))?;

    if !curl_output.status.success() {
        return Err(format!("Gemini API error: {}", String::from_utf8_lossy(&curl_output.stderr)));
    }

    let response_str = String::from_utf8_lossy(&curl_output.stdout);

    // 5. Parse the Gemini response
    // Structure: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
    let parsed: serde_json::Value = serde_json::from_str(&response_str)
        .map_err(|e| format!("Failed to parse Gemini response: {}", e))?;

    // Check for API errors
    if let Some(error) = parsed.get("error") {
        return Err(format!("Gemini API error: {}", error));
    }

    let text = parsed["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| format!("Failed to extract text from Gemini response: {}", response_str))?;

    // Extract JSON (Gemini sometimes wraps in markdown code blocks)
    let json_str = if text.contains("```json") {
        text.split("```json").nth(1).and_then(|s| s.split("```").next()).unwrap_or(text)
    } else if text.contains("```") {
        text.split("```").nth(1).and_then(|s| s.split("```").next()).unwrap_or(text)
    } else {
        text
    };

    let content_val: serde_json::Value = serde_json::from_str(json_str.trim())
        .map_err(|e| format!("Failed to parse Gemini JSON: {} | Raw text: {}", e, text))?;

    let mut clips = Vec::new();

    // Try parsing as direct array or as { clips: [...] }
    if let Some(arr) = content_val.as_array() {
        for item in arr {
            if let Ok(clip) = serde_json::from_value::<AIClipResult>(item.clone()) {
                clips.push(clip);
            }
        }
    } else if let Some(arr) = content_val["clips"].as_array() {
        for item in arr {
            if let Ok(clip) = serde_json::from_value::<AIClipResult>(item.clone()) {
                clips.push(clip);
            }
        }
    }

    Ok(clips)
}

#[derive(Serialize, Deserialize)]
pub struct WordTiming {
    pub word: String,
    pub start: f64,
    pub end: f64,
}

#[tauri::command]
pub async fn generate_clip_transcript(video_path: String, start_time: f64, end_time: f64, model_type: String, app_handle: AppHandle) -> Result<String, String> {
    let ffmpeg_path = get_sidecar_path(&app_handle, "ffmpeg")?;
    let whisper_path = get_sidecar_path(&app_handle, "whisper-cli")?;

    let temp_dir = std::env::temp_dir();
    let temp_wav = temp_dir.join(format!("clipmax_seg_{}_{}.wav", start_time as u64, end_time as u64));
    let model_path = whisper_model_path(&model_type);
    
    // Model must already be downloaded by the frontend via download_whisper_model.
    if !model_path.exists() {
        return Err("Model Whisper belum diunduh. Silakan klik 'Start Analysis' lagi untuk mengunduhnya.".to_string());
    }

    // 2. Slice video and convert to 16kHz WAV
    let ffmpeg_out = new_command(&ffmpeg_path)
        .args([
            "-y", 
            "-ss", &start_time.to_string(),
            "-to", &end_time.to_string(),
            "-i", &video_path,
            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
            "-af", "afftdn,highpass=f=100,lowpass=f=7000,loudnorm",
            &temp_wav.to_string_lossy()
        ])
        .output()
        .map_err(|e| format!("FFmpeg execution failed: {}", e))?;

    if !ffmpeg_out.status.success() {
        return Err(format!("FFmpeg failed: {}", String::from_utf8_lossy(&ffmpeg_out.stderr)));
    }

    // 3. Run whisper-cli sidecar — force word-level timestamps
    let output = new_command(&whisper_path)
        .args([
            "-m", &model_path.to_string_lossy(),
            "-f", &temp_wav.to_string_lossy(),
            "-oj",
            "-l", "id",
            "-sow",
            "-ml", "1",
            "-of", &temp_wav.to_string_lossy()
        ])
        .output()
        .map_err(|e| format!("whisper-cli failed: {}", e))?;

    if !output.status.success() {
        return Err(format!("whisper-cli error: {}", String::from_utf8_lossy(&output.stderr)));
    }

    // 4. Read the generated JSON
    let json_path = temp_dir.join(format!("clipmax_seg_{}_{}.wav.json", start_time as u64, end_time as u64));
    let transcript = std::fs::read_to_string(&json_path)
        .map_err(|e| format!("Failed to read transcript JSON: {}", e))?;

    Ok(transcript)
}

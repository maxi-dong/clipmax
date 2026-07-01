use std::fs;
use rustface::{Detector, ImageData};
use tauri::Manager;
use crate::sidecar::get_sidecar_path;
use crate::utils::new_command;

pub fn detect_best_face_x(
    app_handle: &tauri::AppHandle,
    video_path: &str,
    start_time: f64,
    end_time: f64,
) -> Result<Option<u32>, String> {
    
    // Find seeta model file
    let mut model_path = std::env::current_dir().unwrap().join("seeta_fd_frontal_v1.0.bin");
    
    if !model_path.exists() {
        if let Ok(resource_dir) = app_handle.path().resource_dir() {
            model_path = resource_dir.join("seeta_fd_frontal_v1.0.bin");
        }
    }
    
    if !model_path.exists() {
        return Err("seeta_fd_frontal_v1.0.bin model file not found".into());
    }
        
    let mut detector = rustface::create_detector(model_path.to_str().unwrap())
        .map_err(|e| format!("Failed to create face detector: {}", e))?;
        
    detector.set_min_face_size(20);
    detector.set_score_thresh(2.0);
    detector.set_pyramid_scale_factor(0.8);
    detector.set_slide_window_step(4, 4);

    let duration = end_time - start_time;
    let mid_time = start_time + (duration / 2.0);
    
    let temp_dir = std::env::temp_dir();
    let frame_path = temp_dir.join(format!("clipmax_face_frame_{}.jpg", std::time::UNIX_EPOCH.elapsed().unwrap().as_millis()));
    
    let ffmpeg_path = get_sidecar_path(app_handle, "ffmpeg")?;
    
    // Gunakan new_command() agar FFmpeg tidak membuka jendela terminal di Windows
    let output = new_command(&ffmpeg_path)
        .args(&[
            "-ss", &mid_time.to_string(),
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "2",
            frame_path.to_str().unwrap()
        ])
        .output()
        .map_err(|e| format!("FFmpeg failed: {}", e))?;
    
    if !output.status.success() {
        return Err("Failed to extract frame with FFmpeg".into());
    }

    if !frame_path.exists() {
        return Ok(None);
    }

    // Load image
    let img = image::open(&frame_path).map_err(|e| e.to_string())?;
    let gray_img = img.to_luma8();
    let (width, height) = gray_img.dimensions();
    
    let mut image_data = ImageData::new(gray_img.as_raw(), width, height);

    let faces = detector.detect(&mut image_data);
    
    // Clean up frame
    let _ = fs::remove_file(&frame_path);

    if faces.is_empty() {
        return Ok(None);
    }
    
    // Find biggest/highest score face
    let best_face = faces.into_iter().max_by(|a, b| {
        a.score().partial_cmp(&b.score()).unwrap_or(std::cmp::Ordering::Equal)
    });
    
    if let Some(face) = best_face {
        let bbox = face.bbox();
        let center_x = bbox.x() + (bbox.width() as i32 / 2);
        // Ensure within bounds
        let center_x = center_x.max(0) as u32;
        return Ok(Some(center_x));
    }
    
    Ok(None)
}

use serde::{Deserialize, Serialize};
use std::process::Command;
use std::path::{Path, PathBuf};
use std::fs;
use tauri::{AppHandle, Emitter};

use crate::branding::build_branding_filter;
use crate::antidup::build_antidup_filter;

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportConfig {
    pub resolution: String,
    pub vertical_layout: Option<String>,
    pub quality: String,
    pub branding: BrandingConfig,
    #[serde(rename = "antiDup")]
    pub anti_dup: AntiDupConfig,
    #[serde(rename = "outputDir")]
    pub output_dir: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BrandingConfig {
    pub enabled: bool,
    pub logo_file: Option<String>,
    pub position: String,
    pub size: u32,
    pub opacity: u32,
    pub animation_mode: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AntiDupConfig {
    pub enabled: bool,
    pub level: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Word {
    pub word: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleConfig {
    pub enabled: bool,
    pub style: String,
    pub font_family: String,
    pub font_size: u32,
    pub font_color: String,
    pub border_color: String,
    pub border_width: u32,
    pub margin_bottom: u32,
    pub max_words_per_line: usize,
    pub words: Vec<Word>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub name: String,
    pub start_time: f64,
    pub end_time: f64,
    pub subtitles: Option<SubtitleConfig>,
}

fn hex_to_ass_color(hex: &str) -> String {
    // Converts #RRGGBB to &H00BBGGRR
    let hex = hex.trim_start_matches('#');
    if hex.len() == 6 {
        let r = &hex[0..2];
        let g = &hex[2..4];
        let b = &hex[4..6];
        format!("&H00{}{}{}", b, g, r)
    } else {
        "&H00FFFFFF".to_string()
    }
}


#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    clip_id: String,
    status: String,
}

#[tauri::command]
pub async fn export_clips(
    app_handle: AppHandle,
    video_src: String,
    clips: Vec<Clip>,
    config: ExportConfig,
) -> Result<String, String> {
    // Note: In reality, video_src here might be a blob URL or object URL.
    // We would need the real file path. We'll assume the frontend passes the real path soon.

    let input_path = Path::new(&video_src);
    let parent_dir = if let Some(dir) = &config.output_dir {
        PathBuf::from(dir)
    } else {
        input_path.parent().unwrap_or(Path::new("")).to_path_buf()
    };
    
    let video_stem = input_path.file_stem().unwrap_or_default().to_string_lossy();
    
    let output_dir = parent_dir.join(format!("{}_Clips", video_stem));
    if !output_dir.exists() {
        if let Err(e) = fs::create_dir_all(&output_dir) {
            return Err(format!("Failed to create output directory: {}", e));
        }
    }

    for (index, clip) in clips.iter().enumerate() {
        println!("Processing clip: {}", clip.name);

        let _ = app_handle.emit(
            "export-progress",
            ProgressPayload {
                clip_id: clip.id.clone(),
                status: "processing".into(),
            },
        );

        let output_filename = format!("{:03}_{}.mp4", index + 1, clip.name.replace(" ", "_"));
        let output_path = output_dir.join(&output_filename);

        let mut args = vec![
            "-y".to_string(), // Overwrite
            "-ss".to_string(),
            clip.start_time.to_string(),
            "-to".to_string(),
            clip.end_time.to_string(),
            "-i".to_string(),
            video_src.clone(),
        ];

        // Build the filter graph
        let mut filter_complex = String::new();
        let mut current_input_label = "[0:v]".to_string();
        let mut filter_step = 0;

        // 1. Resolution & Crop
        let mut play_res_x = 1920;
        let mut play_res_y = 1080;
        let mut res_filter = String::new();
        let mut is_complex_layout = false;

        match config.resolution.as_str() {
            "1080p" => {
                res_filter = "scale=1920:1080".to_string();
                play_res_x = 1920;
                play_res_y = 1080;
            }
            "720p" => {
                res_filter = "scale=1280:720".to_string();
                play_res_x = 1280;
                play_res_y = 720;
            }
            "vertical-1080p" => {
                play_res_x = 1080;
                play_res_y = 1920;
                
                let layout = config.vertical_layout.as_deref().unwrap_or("crop");
                match layout {
                    "blur" => {
                        is_complex_layout = true;
                        let next_label = format!("[v{}]", filter_step);
                        filter_complex.push_str(&format!(
                            "{0}scale=1080:1920,boxblur=20:10[bg_{1}]; {0}scale=1080:-1[fg_{1}]; [bg_{1}][fg_{1}]overlay=y=(H-h)/2{2};",
                            current_input_label, filter_step, next_label
                        ));
                        current_input_label = next_label;
                        filter_step += 1;
                    }
                    "split" => {
                        is_complex_layout = true;
                        let next_label = format!("[v{}]", filter_step);
                        filter_complex.push_str(&format!(
                            "{0}crop=ih*9/16:ih/2:(iw-ih*9/16)/2:0,scale=1080:960[top_{1}]; \
                             {0}crop=ih*9/16:ih/2:(iw-ih*9/16)/2:ih/4,scale=1080:960[bottom_{1}]; \
                             [top_{1}][bottom_{1}]vstack=inputs=2{2};",
                            current_input_label, filter_step, next_label
                        ));
                        current_input_label = next_label;
                        filter_step += 1;
                    }
                    _ => {
                        res_filter = "crop=ih*9/16:ih,scale=1080:1920".to_string();
                    }
                }
            }
            _ => {} // original, do nothing
        }

        if !is_complex_layout && !res_filter.is_empty() {
            let next_label = format!("[v{}]", filter_step);
            filter_complex.push_str(&format!("{}{}{};", current_input_label, res_filter, next_label));
            current_input_label = next_label;
            filter_step += 1;
        }

        // 2. Anti-dup
        if let Some(antidup) = build_antidup_filter(&config.anti_dup) {
            let next_label = format!("[v{}]", filter_step);
            filter_complex.push_str(&format!("{}{}{};", current_input_label, antidup, next_label));
            current_input_label = next_label;
            filter_step += 1;
        }

        // 3. Subtitles (ASS)
        let mut ass_path_opt: Option<PathBuf> = None;
        if let Some(sub) = &clip.subtitles {
            if sub.enabled && !sub.words.is_empty() {
                let primary_color = hex_to_ass_color(&sub.font_color);
                let secondary_color = if sub.style == "karaoke" {
                    // For karaoke, make secondary transparent or dark
                    "&H88FFFFFF".to_string() // Half transparent white
                } else {
                    primary_color.clone()
                };
                let border_color = hex_to_ass_color(&sub.border_color);

                let mut ass_content = format!(
                    "[Script Info]\nScriptType: v4.00+\nPlayResX: {}\nPlayResY: {}\n\n\
                    [V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n\
                    Style: Default,{},{},{},{},{},&H00000000,-1,0,0,0,100,100,0,0,1,{},0,2,10,10,{},1\n\n\
                    [Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n",
                    play_res_x, play_res_y, sub.font_family, sub.font_size, primary_color, secondary_color, border_color, sub.border_width, sub.margin_bottom
                );

                let chunks: Vec<&[Word]> = sub.words.chunks(sub.max_words_per_line).collect();
                for chunk in chunks {
                    let start = chunk.first().unwrap().start;
                    let end = chunk.last().unwrap().end + 0.5; // padding

                    // Normalize timestamps (they are relative to start_time in frontend, but FFmpeg timeline after -ss is also 0)
                    // Wait, frontend words start/end are relative to clip_start_time.
                    // Ass format time: H:MM:SS.cs
                    let format_time = |t: f64| -> String {
                        let h = (t / 3600.0) as u32;
                        let m = ((t % 3600.0) / 60.0) as u32;
                        let s = (t % 60.0) as u32;
                        let cs = ((t.fract()) * 100.0) as u32;
                        format!("{}:{:02}:{:02}.{:02}", h, m, s, cs)
                    };

                    let start_str = format_time(start);
                    let end_str = format_time(end);

                    let mut dialogue_text = String::new();
                    if sub.style == "karaoke" {
                        for w in chunk {
                            // \k is duration in centiseconds
                            let dur_cs = ((w.end - w.start) * 100.0).max(1.0) as u32;
                            dialogue_text.push_str(&format!("{{\\k{}}}{} ", dur_cs, w.word));
                        }
                    } else {
                        for w in chunk {
                            dialogue_text.push_str(&format!("{} ", w.word));
                        }
                    }

                    ass_content.push_str(&format!(
                        "Dialogue: 0,{},{},Default,,0,0,0,,{}\n",
                        start_str, end_str, dialogue_text.trim()
                    ));
                }

                let temp_dir = std::env::temp_dir();
                let ass_path = temp_dir.join(format!("subtitles_{}.ass", clip.id));
                let _ = fs::write(&ass_path, ass_content);
                ass_path_opt = Some(ass_path.clone());
                
                // Note: FFmpeg ass filter paths need escaping if they contain colons (Windows) or backslashes
                // Let's replace backslashes with forward slashes for cross-platform safety
                let safe_path = ass_path.to_string_lossy().replace("\\", "/");
                let ass_filter = format!("ass='{}'", safe_path);

                let next_label = format!("[v{}]", filter_step);
                filter_complex.push_str(&format!("{}{}{};", current_input_label, ass_filter, next_label));
                current_input_label = next_label;
                filter_step += 1;
            }
        }

        // 4. Branding
        let mut has_branding = false;
        if config.branding.enabled && config.branding.logo_file.is_some() {
            has_branding = true;
            // Add the logo input
            args.push("-i".to_string());
            args.push(config.branding.logo_file.clone().unwrap());
            
            // Build logo scale & format
            let target_w = config.branding.size * 10;
            let opacity = config.branding.opacity as f32 / 100.0;
            
            let scale_expr = if config.branding.animation_mode == "pulsing" {
                format!("w='{}*(1+0.1*sin(t*3))':h=-1", target_w)
            } else {
                format!("w={}:h=-1", target_w)
            };

            filter_complex.push_str(&format!(
                "[1:v]scale={},format=rgba,colorchannelmixer=aa={}[logo];",
                scale_expr, opacity
            ));

            // Base position
            let (base_x, base_y) = match config.branding.position.as_str() {
                "top-left" => ("10", "10"),
                "top-center" => ("(W-w)/2", "10"),
                "top-right" => ("W-w-10", "10"),
                "center-left" => ("10", "(H-h)/2"),
                "center" => ("(W-w)/2", "(H-h)/2"),
                "center-right" => ("W-w-10", "(H-h)/2"),
                "bottom-left" => ("10", "H-h-10"),
                "bottom-center" => ("(W-w)/2", "H-h-10"),
                "bottom-right" => ("W-w-10", "H-h-10"),
                _ => ("W-w-10", "10"),
            };

            let (overlay_x, overlay_y) = match config.branding.animation_mode.as_str() {
                "static" | "pulsing" => (base_x.to_string(), base_y.to_string()),
                "hover" => (
                    format!("'{}+15*sin(t*1.5)'", base_x),
                    format!("'{}+15*cos(t*1.3)'", base_y),
                ),
                "slide-in" => (
                    format!("'{}+(W-{})*max(1-t/1.5,0)'", base_x, base_x),
                    base_y.to_string()
                ),
                "hopping" => (
                    base_x.to_string(),
                    format!("'{}-20*abs(sin(t*3))'", base_y)
                ),
                _ => (base_x.to_string(), base_y.to_string()),
            };

            let next_label = format!("[v{}]", filter_step);
            filter_complex.push_str(&format!(
                "{}[logo]overlay=x={}:y={}{};",
                current_input_label, overlay_x, overlay_y, next_label
            ));
            current_input_label = next_label;
            filter_step += 1;
        }

        // Apply filters to args
        if filter_step > 0 {
            let mut final_filter = filter_complex.trim_end_matches(';').to_string();
            
            args.push("-filter_complex".to_string());
            let last_label = format!("[v{}]", filter_step - 1);
            if final_filter.ends_with(&last_label) {
                final_filter = final_filter.strip_suffix(&last_label).unwrap().to_string();
            }
            args.push(final_filter);
        }

        // Quality and Encoding
        // For H264 hardware encoding on Mac (VideoToolbox), we could use h264_videotoolbox
        // But libx264 is safer for general use. Let's stick to libx264 for cross-platform.
        args.push("-c:v".to_string());
        args.push("libx264".to_string());
        
        match config.quality.as_str() {
            "High" => { args.push("-crf".to_string()); args.push("18".to_string()); },
            "Medium" => { args.push("-crf".to_string()); args.push("23".to_string()); },
            "Low" => { args.push("-crf".to_string()); args.push("28".to_string()); },
            _ => { args.push("-crf".to_string()); args.push("23".to_string()); },
        }

        args.push("-c:a".to_string());
        args.push("aac".to_string());
        
        args.push(output_path.to_string_lossy().to_string());

        println!("Running FFmpeg with args: {:?}", args);

        let path_env = std::env::var("PATH").unwrap_or_default();
        let new_path = format!("/opt/homebrew/opt/ffmpeg-full/bin:{}:/opt/homebrew/bin:/usr/local/bin", path_env);

        let output = Command::new("ffmpeg")
            .env("PATH", new_path)
            .args(&args)
            .output();

        match output {
            Ok(o) if o.status.success() => {
                let _ = app_handle.emit(
                    "export-progress",
                    ProgressPayload {
                        clip_id: clip.id.clone(),
                        status: "done".into(),
                    },
                );
            }
            Ok(o) => {
                let err_msg = String::from_utf8_lossy(&o.stderr);
                println!("FFmpeg failed with exit code: {}. Stderr: {}", o.status, err_msg);
                return Err(format!("FFmpeg failed for clip {}: {}", clip.name, err_msg));
            }
            Err(e) => {
                println!("Failed to execute FFmpeg: {}", e);
                return Err(format!("Failed to execute FFmpeg: {}", e));
            }
        }
    }

    Ok(format!("Successfully exported {} clips", clips.len()))
}

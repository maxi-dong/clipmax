use crate::export::BrandingConfig;

pub fn build_branding_filter(
    config: &BrandingConfig,
) -> Option<String> {
    if !config.enabled || config.logo_file.is_none() {
        return None;
    }

    // Logo input is [1:v] since video is [0:v]
    let mut filter = String::new();
    
    // Size and opacity
    // Format: [1:v]scale=w=100:h=-1,format=rgba,colorchannelmixer=aa=0.8[logo];
    // Size from React is an integer 5 to 50. We'll map this to absolute width (e.g. 15 -> 150px).
    let target_w = config.size * 10;
    let opacity = config.opacity as f32 / 100.0;
    
    // Pulse animation needs dynamic scale
    let scale_expr = if config.animation_mode == "pulsing" {
        format!("w='{}*(1+0.1*sin(t*3))':h=-1", target_w)
    } else {
        format!("w={}:h=-1", target_w)
    };

    filter.push_str(&format!(
        "[1:v]scale={},format=rgba,colorchannelmixer=aa={}[logo];",
        scale_expr, opacity
    ));

    // Base position
    let (base_x, base_y) = match config.position.as_str() {
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

    let (overlay_x, overlay_y) = match config.animation_mode.as_str() {
        "static" | "pulsing" => (base_x.to_string(), base_y.to_string()),
        "hover" => (
            format!("'{}+15*sin(t*1.5)'", base_x),
            format!("'{}+15*cos(t*1.3)'", base_y),
        ),
        "slide-in" => (
            // Slide from the right edge
            format!("'{}+(W-{})*max(1-t/1.5,0)'", base_x, base_x),
            base_y.to_string()
        ),
        "hopping" => (
            base_x.to_string(),
            format!("'{}-20*abs(sin(t*3))'", base_y)
        ),
        "random" => {
            // For random, we'll pick Hover as a default for now.
            // In a real random mode, we'd select randomly per clip.
            (
                format!("'{}+15*sin(t*1.5)'", base_x),
                format!("'{}+15*cos(t*1.3)'", base_y),
            )
        }
        _ => (base_x.to_string(), base_y.to_string()),
    };

    filter.push_str(&format!("[0:v][logo]overlay=x={}:y={}", overlay_x, overlay_y));

    Some(filter)
}

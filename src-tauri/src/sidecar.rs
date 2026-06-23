use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Resolves the absolute path to a sidecar binary for the current architecture.
/// Supports both packaged production builds and local cargo run / tauri dev execution.
pub fn get_sidecar_path(app_handle: &AppHandle, binary_name: &str) -> Result<PathBuf, String> {
    // 1. Determine target triple at compile time
    let target = if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else {
        return Err("Unsupported compilation target platform".to_string());
    };

    let mut filename = format!("{}-{}", binary_name, target);
    let mut plain_name = binary_name.to_string();
    if cfg!(target_os = "windows") {
        filename.push_str(".exe");
        plain_name.push_str(".exe");
    }

    // 2. Try next to the running executable with the plain name (Production bundles)
    // Tauri strips target triples and puts sidecars in Contents/MacOS (macOS) or next to the EXE (Windows)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let prod_sidecar = exe_dir.join(&plain_name);
            if prod_sidecar.exists() {
                return Ok(prod_sidecar);
            }

            // Dev fallback: Check with target triple next to the executable
            let dev_flat = exe_dir.join(&filename);
            if dev_flat.exists() {
                return Ok(dev_flat);
            }

            // Dev fallback: Check in exe_dir/binaries/filename
            let dev_binaries = exe_dir.join("binaries").join(&filename);
            if dev_binaries.exists() {
                return Ok(dev_binaries);
            }

            // Dev fallback: Check project source directories relative to exe_dir
            if let Some(project_root) = exe_dir.ancestors().nth(3) {
                let project_binaries = project_root
                    .join("src-tauri")
                    .join("binaries")
                    .join(&filename);
                if project_binaries.exists() {
                    return Ok(project_binaries);
                }
            }
        }
    }

    // 3. Try packaged resources directory with target triple
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let sidecar_path = resource_dir.join("binaries").join(&filename);
        if sidecar_path.exists() {
            return Ok(sidecar_path);
        }
    }

    // 4. Return detailed error if not found in any location
    let resource_path_str = app_handle.path().resource_dir()
        .map(|r| r.join("binaries").join(&filename).to_string_lossy().into_owned())
        .unwrap_or_else(|_| "Unavailable".to_string());
    
    Err(format!(
        "Sidecar binary '{}' not found on system. Resolved filename: '{}' / '{}'.\n\
         Tried locations:\n\
         1. Next to executable (production name): {}\n\
         2. Packaged resources path: {}\n\
         3. Project source folders.\n\
         Please make sure you have run 'npm run download-sidecars' before building.",
        binary_name, filename, plain_name, 
        std::env::current_exe().map(|p| p.parent().unwrap().join(&plain_name).to_string_lossy().into_owned()).unwrap_or_default(),
        resource_path_str
    ))
}

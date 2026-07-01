use std::process::Command;

/// Membuat `Command` baru yang TIDAK akan membuka jendela konsol (terminal) di Windows.
/// Di macOS dan Linux berperilaku persis sama seperti `Command::new()` biasa.
///
/// Gunakan fungsi ini sebagai pengganti `Command::new()` atau `std::process::Command::new()`
/// di seluruh kode backend agar tidak ada terminal popup yang mengganggu pengguna Windows.
pub fn new_command<S: AsRef<std::ffi::OsStr>>(program: S) -> Command {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd = Command::new(program);
        cmd.creation_flags(CREATE_NO_WINDOW);
        return cmd;
    }
    #[cfg(not(target_os = "windows"))]
    Command::new(program)
}

/// Membuat path subtitle ASS yang aman untuk dipakai di FFmpeg filter pada Windows.
/// Windows menggunakan backslash dan drive letter (C:\...) yang perlu di-escape
/// agar FFmpeg bisa membacanya lewat filter `ass='path'`.
///
/// Contoh input  (Windows): C:\Users\Budi\AppData\Local\Temp\sub.ass
/// Contoh output (Windows): C\:/Users/Budi/AppData/Local/Temp/sub.ass
/// Contoh input  (macOS)  : /var/folders/.../sub.ass (tidak berubah)
pub fn ass_path_for_ffmpeg(path: &std::path::Path) -> String {
    let path_str = path.to_string_lossy();

    #[cfg(target_os = "windows")]
    {
        // 1. Ubah semua backslash jadi forward slash
        let forward = path_str.replace('\\', "/");
        // 2. Escape titik dua setelah drive letter: "C:/" → "C\:/"
        //    FFmpeg membutuhkan ini agar tidak salah tafsir sebagai protokol URL
        if forward.len() >= 2 && forward.as_bytes()[1] == b':' {
            let (drive, rest) = forward.split_at(1);
            // rest dimulai dengan ":/..." → jadikan "\:/..."
            let escaped = format!("{}\\{}", drive, &rest);
            return escaped;
        }
        return forward;
    }

    #[cfg(not(target_os = "windows"))]
    {
        path_str.to_string()
    }
}

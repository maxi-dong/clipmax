# 🎬 ClipMax — Smart Video Clipper

ClipMax adalah aplikasi desktop modern untuk meng-edit, memotong, dan mengekspor klip video dengan bantuan AI secara otomatis. Dibangun menggunakan teknologi **Tauri (Rust + React)**, ClipMax memberikan performa native, tanpa electron, ringan, dan cepat!

## ✨ Fitur Utama

- **🚀 Ringan & Cepat:** Ditenagai oleh **Tauri**, menggunakan webview bawaan OS untuk UI dan **Rust** untuk backend. Tidak memakan banyak memori seperti aplikasi Electron.
- **🤖 Multi-Mode AI Clipping:**
  - **Audio Spike (Gratis, Offline):** Deteksi otomatis bagian video yang memiliki volume tinggi (FFmpeg).
  - **Keyword Search (Gratis, Offline):** Cari kata spesifik dari seluruh video menggunakan Whisper.cpp.
  - **Gemini & OpenAI GPT-4o (API Key):** Ekstrak otomatis *highlight* paling menarik dari video panjang menjadi klip-klip viral untuk TikTok/Reels.
- **🎨 Subtitle Studio Lengkap:** Editor subtitle visual per-kata, dukung format **Karaoke**, styling lengkap (warna font, border, margin), dan output *hard-subbed* via `.ass`.
- **⚡ Parallel Export:** Ekspor beberapa klip sekaligus (multi-threading) untuk mempercepat proses pembuatan klip Anda.
- **🔧 Built-in Bundled Binaries:** Tidak perlu repot meng-install dependensi! FFmpeg, yt-dlp, dan whisper-cli sudah dibundel sebagai sidecar.

## 🛠 Tech Stack

- **Frontend:** React, TypeScript, Vite, CSS (Vanilla Custom Properties)
- **Backend:** Rust, Tauri v2
- **Tools Integrasi:** FFmpeg (Manipulasi & Export Video), Whisper.cpp (Transkripsi Audio lokal), yt-dlp (Downloader Video Online)

## 🏃‍♂️ Cara Menjalankan Project (Development)

Pastikan Anda memiliki [Node.js](https://nodejs.org/) dan [Rust](https://rustup.rs/) terinstal.

1. Clone repositori ini.
2. Install dependensi frontend:
   ```bash
   npm install
   ```
3. Jalankan aplikasi dalam mode development:
   ```bash
   npm run tauri dev
   ```

## 📦 Build untuk Produksi

Untuk mem-build installer (contoh `.dmg` untuk macOS, `.exe` untuk Windows):
```bash
npm run tauri build
```

---

*Dibuat untuk memudahkan konten kreator merangkum video panjang menjadi klip pendek yang siap viral.*

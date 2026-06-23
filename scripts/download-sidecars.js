import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BINARIES_DIR = path.join(__dirname, '..', 'src-tauri', 'binaries');

// Recursive helper to find a file within a directory
function findFile(dir, filename) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const found = findFile(fullPath, filename);
      if (found) return found;
    } else if (file === filename) {
      return fullPath;
    }
  }
  return null;
}

// Download file with redirect handling
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        const resolvedUrl = new URL(response.headers.location, url).href;
        downloadFile(resolvedUrl, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: HTTP ${response.statusCode} for ${url}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    });
    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      reject(err);
    });
  });
}

// Unzip utility helper
function extractZip(zipPath, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  if (process.platform === 'win32') {
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`);
  } else {
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`);
  }
}

async function main() {
  console.log('--- ClipMax Sidecar Downloader ---');
  if (!fs.existsSync(BINARIES_DIR)) {
    fs.mkdirSync(BINARIES_DIR, { recursive: true });
  }

  const isMac = process.platform === 'darwin';
  const isWindows = process.platform === 'win32';

  if (!isMac && !isWindows) {
    console.error('Unsupported platform for sidecars: ' + process.platform);
    process.exit(1);
  }

  const tempDir = path.join(__dirname, '..', 'temp_sidecar_downloads');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    if (isMac) {
      console.log('Detected macOS. Downloading binaries for arm64 and x86_64...');

      // 1. Download macOS yt-dlp (Universal)
      const ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
      const tempYtDlp = path.join(tempDir, 'yt-dlp_macos');
      console.log(`Downloading yt-dlp (macOS)...`);
      await downloadFile(ytDlpUrl, tempYtDlp);

      // Copy to both apple darwin triples
      const ytDlpArm = path.join(BINARIES_DIR, 'yt-dlp-aarch64-apple-darwin');
      const ytDlpX86 = path.join(BINARIES_DIR, 'yt-dlp-x86_64-apple-darwin');
      fs.copyFileSync(tempYtDlp, ytDlpArm);
      fs.copyFileSync(tempYtDlp, ytDlpX86);
      fs.chmodSync(ytDlpArm, 0o755);
      fs.chmodSync(ytDlpX86, 0o755);
      console.log('Saved yt-dlp sidecars for macOS.');

      // 2. Download macOS ffmpeg (Apple Silicon / arm64)
      const ffmpegArmUrl = 'https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip';
      const tempFfmpegArmZip = path.join(tempDir, 'ffmpeg_arm.zip');
      const tempFfmpegArmExtract = path.join(tempDir, 'ffmpeg_arm_extracted');
      console.log('Downloading ffmpeg (macOS arm64)...');
      await downloadFile(ffmpegArmUrl, tempFfmpegArmZip);
      console.log('Extracting ffmpeg arm64...');
      extractZip(tempFfmpegArmZip, tempFfmpegArmExtract);
      const ffmpegArmFile = findFile(tempFfmpegArmExtract, 'ffmpeg');
      if (!ffmpegArmFile) throw new Error('Could not find ffmpeg binary in arm64 zip');
      const destFfmpegArm = path.join(BINARIES_DIR, 'ffmpeg-aarch64-apple-darwin');
      fs.copyFileSync(ffmpegArmFile, destFfmpegArm);
      fs.chmodSync(destFfmpegArm, 0o755);
      console.log('Saved ffmpeg arm64 sidecar.');

      // 3. Download macOS ffmpeg (Intel / x86_64)
      const ffmpegX86Url = 'https://ffmpeg.martin-riedl.de/redirect/latest/macos/amd64/release/ffmpeg.zip';
      const tempFfmpegX86Zip = path.join(tempDir, 'ffmpeg_x86.zip');
      const tempFfmpegX86Extract = path.join(tempDir, 'ffmpeg_x86_extracted');
      console.log('Downloading ffmpeg (macOS x86_64)...');
      await downloadFile(ffmpegX86Url, tempFfmpegX86Zip);
      console.log('Extracting ffmpeg x86_64...');
      extractZip(tempFfmpegX86Zip, tempFfmpegX86Extract);
      const ffmpegX86File = findFile(tempFfmpegX86Extract, 'ffmpeg');
      if (!ffmpegX86File) throw new Error('Could not find ffmpeg binary in x86_64 zip');
      const destFfmpegX86 = path.join(BINARIES_DIR, 'ffmpeg-x86_64-apple-darwin');
      fs.copyFileSync(ffmpegX86File, destFfmpegX86);
      fs.chmodSync(destFfmpegX86, 0o755);
      console.log('Saved ffmpeg x86_64 sidecar.');
    }

    if (isWindows) {
      console.log('Detected Windows. Downloading binaries for x86_64...');

      // 1. Download Windows yt-dlp (x86_64)
      const ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
      const destYtDlp = path.join(BINARIES_DIR, 'yt-dlp-x86_64-pc-windows-msvc.exe');
      console.log('Downloading yt-dlp.exe...');
      await downloadFile(ytDlpUrl, destYtDlp);
      console.log('Saved yt-dlp Windows sidecar.');

      // 2. Download Windows ffmpeg (x86_64)
      const ffmpegUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
      const tempFfmpegZip = path.join(tempDir, 'ffmpeg_win.zip');
      const tempFfmpegExtract = path.join(tempDir, 'ffmpeg_win_extracted');
      console.log('Downloading ffmpeg release essentials zip (Windows)...');
      await downloadFile(ffmpegUrl, tempFfmpegZip);
      console.log('Extracting ffmpeg zip...');
      extractZip(tempFfmpegZip, tempFfmpegExtract);
      const ffmpegExeFile = findFile(tempFfmpegExtract, 'ffmpeg.exe');
      if (!ffmpegExeFile) throw new Error('Could not find ffmpeg.exe in Windows zip');
      const destFfmpeg = path.join(BINARIES_DIR, 'ffmpeg-x86_64-pc-windows-msvc.exe');
      fs.copyFileSync(ffmpegExeFile, destFfmpeg);
      console.log('Saved ffmpeg Windows sidecar.');
    }

    console.log('Clean up temporary files...');
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('Sidecars successfully downloaded!');
    process.exit(0);
  } catch (error) {
    console.error('Error downloading sidecars:', error);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    process.exit(1);
  }
}

main();

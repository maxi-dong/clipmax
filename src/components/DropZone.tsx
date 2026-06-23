import React, { useRef, useCallback } from 'react';

interface DropZoneProps {
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (path: string, url: string, name: string) => void;
}

import { open, message } from '@tauri-apps/plugin-dialog';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

const DropZone: React.FC<DropZoneProps> = ({
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unlisten = listen<{ percent: number }>('download-progress', (event) => {
      setDownloadProgress(event.payload.percent);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const handleClick = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Video',
          extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm']
        }]
      });
      if (typeof selected === 'string') {
        const url = convertFileSrc(selected);
        const name = selected.split(/[\/\\]/).pop() || 'video';
        onFileSelect(selected, url, name);
      }
    } catch (err) {
      console.error("Failed to open dialog", err);
    }
  }, [onFileSelect]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        // Fallback for web mode
        const url = URL.createObjectURL(file);
        onFileSelect('', url, file.name);
      }
    },
    [onFileSelect],
  );

  const handleUrlSubmit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!urlInput.trim()) return;
    setIsDownloading(true);
    setDownloadProgress(0);
    try {
      const downloadedPath = await invoke<string>('download_video', { url: urlInput.trim() });
      const url = convertFileSrc(downloadedPath);
      const name = downloadedPath.split(/[\/\\]/).pop() || 'Downloaded Video';
      onFileSelect(downloadedPath, url, name);
    } catch (err) {
      console.error("Download failed", err);
      message(`Download failed: ${err}\nMake sure yt-dlp is installed and available in your PATH.`, { title: 'Download Error', kind: 'error' });
    } finally {
      setIsDownloading(false);
      setUrlInput('');
    }
  };

  return (
    <div
      className={`drop-zone animate-fadeIn ${isDragOver ? 'drop-zone--active' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={handleClick}
      id="drop-zone"
    >
      <div className="drop-zone__icon">🎬</div>
      <h1 className="drop-zone__title">Drop your video here</h1>
      <p className="drop-zone__subtitle">
        Drag & drop a video file, or click to browse.
        <br />
        Supports MP4, MOV, MKV, AVI, WebM
      </p>
        
        <div className="url-upload" onClick={(e) => e.stopPropagation()} style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              placeholder="Or paste YouTube / TikTok URL..." 
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="form-control"
              style={{ width: '300px' }}
              disabled={isDownloading}
            />
            <button 
              className="btn btn--primary" 
              onClick={handleUrlSubmit}
              disabled={isDownloading || !urlInput.trim()}
            >
              {isDownloading ? `Downloading... ${Math.round(downloadProgress)}%` : 'Fetch Video'}
            </button>
          </div>
          {isDownloading && (
            <div style={{ width: '100%', maxWidth: '400px', height: '6px', backgroundColor: '#333', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${downloadProgress}%`, height: '100%', backgroundColor: '#4caf50', transition: 'width 0.2s ease-out' }}></div>
            </div>
          )}
        </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default DropZone;

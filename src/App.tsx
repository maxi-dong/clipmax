import { useState, useCallback, useEffect, useRef } from 'react';
import type { Clip, AppMode } from './types';
import { generateId } from './utils';
import TitleBar from './components/TitleBar';
import DropZone from './components/DropZone';
import VideoPlayer from './components/VideoPlayer';
import Timeline from './components/Timeline';
import ClipList from './components/ClipList';
import ExportDialog from './components/ExportDialog';
import AIDialog from './components/AIDialog';
import SubtitleEditor from './components/SubtitleEditor';
import type { ExportConfig } from './components/ExportDialog';

import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { message } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';

function App() {
  // ---- State ----
  const [mode, setMode] = useState<AppMode>('manual');
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [markOut, setMarkOut] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ done: 0, total: 0 });
  const [exportError, setExportError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiNotification, setAiNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // ---- File Handling ----
  const loadVideo = useCallback((path: string, url: string, name: string) => {
    setVideoSrc(url);
    setVideoPath(path);
    setVideoName(name);
    setCurrentTime(0);
    setIsPlaying(false);
    setClips([]);
    setMarkIn(null);
    setMarkOut(null);
    setSelectedClipId(null);
  }, []);

  const handleNewProject = useCallback(() => {
    if (window.confirm("Are you sure you want to start a new project? This will clear all clips and the current video.")) {
      setVideoSrc(null);
      setVideoPath(null);
      setVideoName("");
      setCurrentTime(0);
      setIsPlaying(false);
      setClips([]);
      setMarkIn(null);
      setMarkOut(null);
      setSelectedClipId(null);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file);
        loadVideo('', url, file.name); // No path in web drop
      }
    },
    [loadVideo],
  );

  // ---- AI Operations ----
  const handleAIAnalyze = async (aiMode: string, options: any) => {
    setIsAIDialogOpen(false);
    setAiNotification(null);

    if (!videoSrc) {
      setAiNotification({ type: 'error', message: 'Please load a video first.' });
      return;
    }

    if (!videoPath || videoPath.startsWith('blob:') || videoPath === '') {
      setAiNotification({ type: 'error', message: 'AI Mode requires a real file path.\n\nPlease load your video using the file picker button (Browse Files), not drag & drop.' });
      return;
    }

    console.log("[AI] Starting analysis. Mode:", aiMode, "Path:", videoPath);
    setIsAnalyzing(true);
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      if (aiMode === 'audio_spike') {
        console.log("[AI] Calling analyze_audio_spike...");
        const results = await invoke<any[]>('analyze_audio_spike', { videoPath: videoPath });
        
        if (results.length === 0) {
          setAiNotification({ type: 'info', message: 'No significant audio spikes found.\n\nTip: Try a video with more varied audio (laughter, applause, reactions). This mode works best with talk shows, podcasts, or live events.' });
          return;
        }

        const newClips = results.map((res: any, index: number) => ({
          id: `ai-clip-${Date.now()}-${index}`,
          startTime: res.start_time,
          endTime: res.end_time,
          name: res.reason || `AI Auto Clip ${index + 1}`
        }));

        setClips((prev) => [...prev, ...newClips]);
        setAiNotification({ type: 'success', message: `✅ Generated ${newClips.length} AI clips from audio analysis!` });

      } else if (aiMode === 'openai') {
        if (!options.apiKey) {
          setAiNotification({ type: 'error', message: 'API Key is required for OpenAI mode.' });
          return;
        }

        console.log("[AI] Calling extract_and_transcribe...");
        const transcript = await invoke<string>('extract_and_transcribe', { 
          videoPath: videoPath, 
          apiKey: options.apiKey 
        });

        console.log("[AI] Calling analyze_with_openai...");
        const results = await invoke<any[]>('analyze_with_openai', { 
          transcript: transcript, 
          apiKey: options.apiKey 
        });

        if (results.length === 0) {
          setAiNotification({ type: 'info', message: 'OpenAI could not find any interesting moments in this video.' });
          return;
        }

        const newClips = results.map((res: any, index: number) => ({
          id: `ai-clip-${Date.now()}-${index}`,
          startTime: res.start_time,
          endTime: res.end_time,
          name: res.reason || `AI GPT Clip ${index + 1}`
        }));

        setClips((prev) => [...prev, ...newClips]);
        setAiNotification({ type: 'success', message: `✅ Generated ${newClips.length} AI clips using OpenAI GPT!` });

      } else if (aiMode === 'gemini') {
        if (!options.apiKey) {
          setAiNotification({ type: 'error', message: 'API Key is required for Gemini mode.' });
          return;
        }

        console.log("[AI] Calling analyze_with_gemini...");
        const results = await invoke<any[]>('analyze_with_gemini', { 
          videoPath: videoPath, 
          apiKey: options.apiKey 
        });

        if (results.length === 0) {
          setAiNotification({ type: 'info', message: 'Gemini could not find any interesting moments in this video.' });
          return;
        }

        const newClips = results.map((res: any, index: number) => ({
          id: `ai-clip-${Date.now()}-${index}`,
          startTime: res.start_time,
          endTime: res.end_time,
          name: res.reason || `AI Gemini Clip ${index + 1}`
        }));

        setClips((prev) => [...prev, ...newClips]);
        setAiNotification({ type: 'success', message: `✅ Generated ${newClips.length} AI clips using Gemini!` });

      } else if (aiMode === 'keyword') {
        if (!options.keyword || !options.keyword.trim()) {
          setAiNotification({ type: 'error', message: 'Please enter a keyword to search for.' });
          return;
        }

        console.log("[AI] Calling transcribe_local...");
        const transcript = await invoke<string>('transcribe_local', { 
          videoPath: videoPath 
        });

        const parsed = JSON.parse(transcript);
        const segments = parsed.transcription || [];
        
        const keywords = options.keyword
          .split(',')
          .map((k: string) => k.trim())
          .filter((k: string) => k.length > 0);

        if (keywords.length === 0) {
          setAiNotification({ type: 'error', message: 'Please enter a valid keyword to search for.' });
          return;
        }

        const newClips: Clip[] = [];

        for (const seg of segments) {
          if (seg.text) {
            const segTextLower = seg.text.toLowerCase();
            const matchedKeywords = keywords.filter((k: string) => 
              segTextLower.includes(k.toLowerCase())
            );

            if (matchedKeywords.length > 0) {
              const startSec = (seg.offsets?.from || 0) / 1000;
              const matchedStr = matchedKeywords.map((k: string) => `"${k}"`).join(', ');
              
              const prePad = 2; // Fixed pre-padding
              const clipDuration = options.clipDuration !== undefined ? Number(options.clipDuration) : 30;
              
              const calculatedStartTime = Math.max(0, startSec - prePad);
              
              newClips.push({
                id: `ai-keyword-${Date.now()}-${newClips.length}`,
                startTime: calculatedStartTime,
                endTime: calculatedStartTime + clipDuration,
                name: `Keyword: ${matchedStr}`
              });
            }
          }
        }

        if (newClips.length === 0) {
          setAiNotification({ type: 'info', message: `Keywords not found in this video.\n\nKeywords searched: ${keywords.map((k: string) => `"${k}"`).join(', ')}` });
          return;
        }

        setClips((prev) => [...prev, ...newClips]);
        setAiNotification({ type: 'success', message: `✅ Found ${newClips.length} clips matching your keywords!` });

      } else if (aiMode === 'auto_split') {
        const splitDuration = options.splitDuration || 60;
        const newClips: Clip[] = [];
        let currentTime = 0;
        let partNumber = 1;
        
        while (currentTime < duration) {
          const endTime = Math.min(currentTime + splitDuration, duration);
          newClips.push({
            id: `ai-split-${Date.now()}-${partNumber}`,
            startTime: currentTime,
            endTime: endTime,
            name: `Part ${partNumber}`
          });
          currentTime += splitDuration;
          partNumber++;
        }
        
        setClips((prev) => [...prev, ...newClips]);
        setAiNotification({ type: 'success', message: `✅ Sliced video into ${newClips.length} parts!` });

      } else {
        setAiNotification({ type: 'info', message: 'This mode is currently under development.' });
      }
    } catch (err) {
      console.error("[AI] Error:", err);
      // Extract meaningful error line
      const fullError = String(err);
      const lines = fullError.split('\n');
      const meaningfulLine = lines.find(l =>
        /error|failed|invalid|no such|cannot|not found/i.test(l) &&
        !/ffmpeg version|built with|configuration:|lib|Copyright/i.test(l)
      ) || lines[0];
      setAiNotification({ type: 'error', message: `AI Analysis failed:\n${meaningfulLine.trim()}` });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ---- Player Controls ----
  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleDurationLoaded = useCallback((dur: number) => {
    setDuration(dur);
  }, []);

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  // ---- Clip Operations ----
  const handleMarkIn = useCallback(() => {
    setMarkIn(currentTimeRef.current);
  }, []);

  const handleMarkOut = useCallback(() => {
    setMarkOut(currentTimeRef.current);
  }, []);

  const handleAddClip = useCallback(() => {
    if (markIn === null || markOut === null || markOut <= markIn) return;
    const newClip: Clip = {
      id: generateId(),
      name: `Clip ${clips.length + 1}`,
      startTime: markIn,
      endTime: markOut,
    };
    setClips((prev) => [...prev, newClip]);
    setMarkIn(null);
    setMarkOut(null);
  }, [markIn, markOut, clips.length]);

  const handleProcessFullVideo = useCallback(() => {
    if (duration <= 0) return;
    const newClip: Clip = {
      id: generateId(),
      name: "Video Utuh",
      startTime: 0,
      endTime: duration,
    };
    setClips((prev) => [...prev, newClip]);
    setSelectedClipId(newClip.id);
    setCurrentTime(0);
  }, [duration]);

  const handleSelectClip = useCallback(
    (id: string, seekToStart = true) => {
      setSelectedClipId((prev) => {
        const isSelected = prev === id;
        if (isSelected) {
          return null; // deselect
        }
        
        // Seek to the clip start time if selected
        if (seekToStart) {
          const clip = clips.find((c) => c.id === id);
          if (clip) {
            setCurrentTime(clip.startTime);
          }
        }
        return id;
      });
    },
    [clips],
  );

  const handleDeleteClip = useCallback((id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
    setSelectedClipId((prev) => (prev === id ? null : prev));
  }, []);

  const handleRenameClip = useCallback((id: string, name: string) => {
    setClips((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c)),
    );
  }, []);

  const handleUpdateClip = useCallback((id: string, startTime: number, endTime: number) => {
    setClips((prev) =>
      prev.map((c) => (c.id === id ? { ...c, startTime, endTime } : c)),
    );
  }, []);

  const handleClipFullUpdate = useCallback((updatedClip: Clip) => {
    setClips((prev) =>
      prev.map((c) => (c.id === updatedClip.id ? updatedClip : c)),
    );
  }, []);

  const handleExportClick = useCallback(() => {
    setShowExportDialog(true);
  }, []);

  const handleStartExport = useCallback(async (config: ExportConfig) => {
    setShowExportDialog(false);
    setExportError(null);
    
    if (!videoPath) {
      setExportError("Video path not found. Please re-import the video using the 'Browse Files' button.");
      return;
    }

    setIsExporting(true);
    setExportProgress({ done: 0, total: clips.length });

    try {
      const result = await invoke('export_clips', {
        videoSrc: videoPath,
        clips,
        config
      });
      message(result as string, { title: 'Success', kind: 'info' });
    } catch (e) {
      console.error(e);
      // Extract only the meaningful error line, not the full ffmpeg banner
      const fullError = String(e);
      const lines = fullError.split('\n');
      // Find the first line with actual error info (starts with 'Error', 'Failed', or contains 'Invalid')
      const meaningfulLine = lines.find(l =>
        /error|failed|invalid|no such|cannot/i.test(l) &&
        !/ffmpeg version|built with|configuration:|lib|Copyright/i.test(l)
      ) || lines[0];
      setExportError(meaningfulLine.trim());
    } finally {
      setIsExporting(false);
    }
  }, [clips, videoPath]);

  // ---- Keyboard Shortcuts ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'i':
          handleMarkIn();
          break;
        case 'o':
          handleMarkOut();
          break;
        case 'e':
          handleAddClip();
          break;
        case 'arrowleft':
          e.preventDefault();
          setCurrentTime((t) => Math.max(0, t - 5));
          break;
        case 'arrowright':
          e.preventDefault();
          setCurrentTime((t) => Math.min(duration, t + 5));
          break;
        case 'delete':
        case 'backspace':
          if (selectedClipId) {
            handleDeleteClip(selectedClipId);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, handleMarkIn, handleMarkOut, handleAddClip, duration, selectedClipId, handleDeleteClip]);

  // ---- Global drag-over for window ----
  useEffect(() => {
    // 1. Web API fallback (for browser testing / non-tauri context)
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
    };
    const handleWindowDragLeave = (e: DragEvent) => {
      if (
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        setIsDragOver(false);
      }
    };
    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file);
        loadVideo('', url, file.name); // Fallback for web drop
      }
    };

    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('drop', handleWindowDrop);

    // 2. Tauri Native File Drop
    let unlistenDrop: () => void;
    let unlistenEnter: () => void;
    let unlistenLeave: () => void;

    const setupTauriEvents = async () => {
      // 1. Drop Events
      unlistenDrop = await listen<{paths: string[]}>('tauri://drop', (event) => {
        setIsDragOver(false);
        const paths = event.payload.paths || event.payload; // v1 vs v2 compatibility
        if (Array.isArray(paths) && paths.length > 0) {
          const filePath = paths[0];
          // We assume it's a video. Ideally we should check extension.
          const url = convertFileSrc(filePath);
          const name = filePath.split(/[/\\]/).pop() || 'Video';
          loadVideo(filePath, url, name);
        }
      });
      
      unlistenEnter = await listen('tauri://drag-enter', () => {
        setIsDragOver(true);
      });
      
      unlistenLeave = await listen('tauri://drag-leave', () => {
        setIsDragOver(false);
      });
      
      // 2. Export Progress
      const unlistenProgress = await listen('export-progress', () => {
        setExportProgress(prev => ({ ...prev, done: prev.done + 1 }));
      });
      
      return () => {
        unlistenProgress();
      }
    };

    setupTauriEvents();

    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
      if (unlistenDrop) unlistenDrop();
      if (unlistenEnter) unlistenEnter();
      if (unlistenLeave) unlistenLeave();
    };
  }, [loadVideo]);

  return (
    <div className="app-layout" id="app-layout">
      <TitleBar
        mode={mode}
        onModeChange={setMode}
        videoName={videoName}
        onNewProject={handleNewProject}
      />

      <main className="main-area" id="main-area">
        {videoSrc ? (
          <VideoPlayer
          src={videoSrc}
          currentTime={currentTime}
          isPlaying={isPlaying}
          onTimeUpdate={handleTimeUpdate}
          onPlayPause={handlePlayPause}
          onDurationLoaded={handleDurationLoaded}
          duration={duration}
          clips={clips}
        />
        ) : (
          <DropZone
            isDragOver={isDragOver}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onFileSelect={loadVideo}
          />
        )}
      </main>

      <ClipList
        clips={clips}
        selectedClipId={selectedClipId}
        onSelectClip={handleSelectClip}
        onDeleteClip={handleDeleteClip}
        onRenameClip={handleRenameClip}
        onExport={handleExportClick}
        exportDisabled={clips.length === 0}
      />

      {videoSrc && (
        <>
        <Timeline
          duration={duration}
          currentTime={currentTime}
          clips={clips}
          selectedClipId={selectedClipId}
          markIn={markIn}
          markOut={markOut}
          onSeek={handleSeek}
          onMarkIn={handleMarkIn}
          onMarkOut={handleMarkOut}
          onAddClip={handleAddClip}
          onUpdateClip={handleUpdateClip}
          onSelectClip={handleSelectClip}
          videoSrc={videoSrc}
        />
        
        {selectedClipId && (
          <div style={{ padding: '0 20px', marginBottom: '15px', gridColumn: '1 / -1' }} className="animate-fadeIn">
            <SubtitleEditor 
              clip={clips.find(c => c.id === selectedClipId)!}
              videoPath={videoPath}
              onUpdate={handleClipFullUpdate}
              onClose={() => setSelectedClipId(null)}
            />
          </div>
        )}

        {!selectedClipId && (
          <div style={{ padding: '0 20px', paddingBottom: '20px', gridColumn: '1 / -1' }}>
            <div className="main-actions" style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn btn--secondary" 
                onClick={() => setIsAIDialogOpen(true)}
                disabled={isAnalyzing}
                style={{ background: 'linear-gradient(45deg, #FF6B6B, #845EC2)', color: 'white', border: 'none', position: 'relative' }}
              >
                {isAnalyzing ? "⏳ Analyzing (AI)..." : "✨ Auto Clip (AI)"}
              </button>
              <button 
                className="btn btn--secondary" 
                onClick={handleProcessFullVideo}
                disabled={isAnalyzing || duration <= 0}
                style={{ background: 'linear-gradient(45deg, #4b7bec, #3867d6)', color: 'white', border: 'none' }}
              >
                🎬 Proses Video Utuh
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {isAnalyzing && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          color: 'white',
          flexDirection: 'column',
          gap: '20px'
        }}>
          <div className="spinner" style={{
            width: '50px',
            height: '50px',
            border: '5px solid rgba(255, 255, 255, 0.3)',
            borderTop: '5px solid #FF6B6B',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          <h2 style={{ margin: 0 }}>AI is thinking...</h2>
          <p style={{ margin: 0, color: '#aaa' }}>Processing your video. This may take a minute.</p>
        </div>
      )}

      {showExportDialog && (
        <ExportDialog
          clipCount={clips.length}
          onClose={() => setShowExportDialog(false)}
          onExport={handleStartExport}
        />
      )}

      {isAIDialogOpen && (
        <AIDialog
          isOpen={isAIDialogOpen}
          onClose={() => setIsAIDialogOpen(false)}
          onAnalyze={handleAIAnalyze}
        />
      )}

      {isExporting && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ width: '400px', textAlign: 'center', padding: '30px' }}>
            <h2 style={{ marginBottom: '15px' }}>🚀 Exporting Clips...</h2>
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: '10px', height: '10px', width: '100%', overflow: 'hidden', marginBottom: '10px' }}>
              <div 
                style={{ 
                  height: '100%', 
                  width: `${exportProgress.total === 0 ? 0 : Math.round((exportProgress.done / exportProgress.total) * 100)}%`, 
                  background: 'var(--accent)',
                  transition: 'width 0.3s ease'
                }} 
              />
            </div>
            <p style={{ color: 'var(--text-secondary)' }}>
              Processed {exportProgress.done} of {exportProgress.total} clips
            </p>
          </div>
        </div>
      )}

      {exportError && (
        <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => setExportError(null)}>
          <div className="modal" style={{ width: '480px', padding: '28px', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setExportError(null)}
              style={{
                position: 'absolute', top: '14px', right: '14px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', fontSize: '20px', lineHeight: 1,
                padding: '4px 8px', borderRadius: '6px',
              }}
              title="Close"
              aria-label="Close error dialog"
            >✕</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '28px' }}>⚠️</span>
              <h2 style={{ margin: 0, fontSize: '17px' }}>Export Failed</h2>
            </div>
            <p style={{
              background: 'var(--bg-tertiary)', borderRadius: '8px',
              padding: '12px 14px', fontSize: '13px', lineHeight: '1.6',
              color: 'var(--text-secondary)', margin: '0 0 20px',
              wordBreak: 'break-word'
            }}>
              {exportError}
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => setExportError(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {aiNotification && (
        <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => setAiNotification(null)}>
          <div className="modal" style={{ width: '460px', padding: '28px', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setAiNotification(null)}
              style={{
                position: 'absolute', top: '14px', right: '14px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', fontSize: '20px', lineHeight: 1,
                padding: '4px 8px', borderRadius: '6px',
              }}
              aria-label="Close"
            >✕</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '26px' }}>
                {aiNotification.type === 'success' ? '✅' : aiNotification.type === 'error' ? '❌' : 'ℹ️'}
              </span>
              <h2 style={{ margin: 0, fontSize: '16px' }}>
                {aiNotification.type === 'success' ? 'Analysis Complete' : aiNotification.type === 'error' ? 'Analysis Failed' : 'No Results'}
              </h2>
            </div>
            <p style={{
              background: 'var(--bg-tertiary)', borderRadius: '8px',
              padding: '12px 14px', fontSize: '13px', lineHeight: '1.7',
              color: 'var(--text-secondary)', margin: '0 0 20px',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word'
            }}>
              {aiNotification.message}
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => setAiNotification(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

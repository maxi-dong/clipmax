import React, { useRef, useEffect, useCallback, useState } from 'react';
import { formatTime } from '../utils';
import type { Clip, SubtitleConfig, Word } from '../types';

interface VideoPlayerProps {
  src: string;
  currentTime: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
  onPlayPause: () => void;
  onDurationLoaded: (duration: number) => void;
  duration: number;
  clips?: Clip[];
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  currentTime,
  isPlaying,
  onTimeUpdate,
  onPlayPause,
  onDurationLoaded,
  duration,
  clips = [],
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync play/pause state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying]);

  // Sync volume
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // Sync playback speed
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
  }, [speed]);

  // Seek when currentTime changes from external source
  const lastExternalSeek = useRef<number | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (
      lastExternalSeek.current !== currentTime &&
      Math.abs(video.currentTime - currentTime) > 0.5
    ) {
      video.currentTime = currentTime;
    }
  }, [currentTime]);

  // Track fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      lastExternalSeek.current = null;
      onTimeUpdate(video.currentTime);
    }
  }, [onTimeUpdate]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video && video.duration && isFinite(video.duration)) {
      onDurationLoaded(video.duration);
    }
  }, [onDurationLoaded]);

  const handleClick = useCallback(() => {
    onPlayPause();
  }, [onPlayPause]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val > 0) setIsMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleSpeedSelect = useCallback((s: number) => {
    setSpeed(s);
    setShowSpeedMenu(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current as any;
    if (!el) return;
    const isFs = document.fullscreenElement || (document as any).webkitFullscreenElement;
    
    if (isFs) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
    } else {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  }, []);

  const volumeIcon = isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊';

  // Compute active subtitles
  let activeSubtitle: { words: Word[], config: SubtitleConfig, clipStartTime: number } | null = null;
  const activeClip = clips.find(c => currentTime >= c.startTime && currentTime <= c.endTime);
  if (activeClip && activeClip.subtitles && activeClip.subtitles.enabled) {
      activeSubtitle = {
          words: activeClip.subtitles.words,
          config: activeClip.subtitles,
          clipStartTime: activeClip.startTime
      };
  }

  return (
    <div
      className="player-container animate-fadeIn"
      id="player-container"
      ref={containerRef}
    >
      <video
        ref={videoRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onClick={handleClick}
        onDoubleClick={toggleFullscreen}
        preload="metadata"
        id="video-element"
      />

      {/* Subtitle Overlay */}
      {activeSubtitle && (
        <div style={{
          position: 'absolute',
          bottom: `${(activeSubtitle.config.marginBottom / 1080) * 100}cqh`,
          left: 0,
          right: 0,
          textAlign: 'center',
          pointerEvents: 'none',
          padding: '0 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10
        }}>
          {(() => {
             const { words, config, clipStartTime } = activeSubtitle;
             // Find current line of words
             const relativeTime = currentTime - clipStartTime;
             
             // Group words by maxWordsPerLine
             const lines: Word[][] = [];
             for (let i = 0; i < words.length; i += config.maxWordsPerLine) {
                 lines.push(words.slice(i, i + config.maxWordsPerLine));
             }
             
             // Find the line that covers the current relativeTime
             // A line is active if relativeTime is between the first word's start and the last word's end + small padding
             const activeLine = lines.find(line => {
                 const start = line[0].start;
                 const end = line[line.length - 1].end + 0.5; // add 0.5s padding so it doesn't disappear too fast
                 return relativeTime >= start && relativeTime <= end;
             });

             if (!activeLine) return null;

             const scaledFontSize = (config.fontSize / 1080) * 100;
             const scaledBorderWidth = (config.borderWidth / 1080) * 100;

             const textShadow = `
                 -${scaledBorderWidth}cqh -${scaledBorderWidth}cqh 0 ${config.borderColor},
                  ${scaledBorderWidth}cqh -${scaledBorderWidth}cqh 0 ${config.borderColor},
                 -${scaledBorderWidth}cqh  ${scaledBorderWidth}cqh 0 ${config.borderColor},
                  ${scaledBorderWidth}cqh  ${scaledBorderWidth}cqh 0 ${config.borderColor}
             `;

             return (
                 <div style={{
                     fontFamily: config.fontFamily,
                     fontSize: `${scaledFontSize}cqh`,
                     fontWeight: 'bold',
                     lineHeight: 1.2,
                     textShadow
                 }}>
                     {activeLine.map((w, idx) => {
                         // Karaoke logic
                         let color = config.fontColor;
                         let opacity = 1;
                         
                         if (config.style === 'karaoke') {
                             if (relativeTime < w.start) {
                                 // Not spoken yet
                                 opacity = 0.5;
                             } else if (relativeTime >= w.start && relativeTime <= w.end + 0.1) {
                                 // Currently speaking
                                 color = config.fontColor;
                             } else {
                                 // Already spoken
                                 color = config.fontColor;
                             }
                         }

                         return (
                             <span key={idx} style={{ color, opacity, transition: 'opacity 0.1s', marginRight: '0.25em' }}>
                                 {w.word}
                             </span>
                         );
                     })}
                 </div>
             );
          })()}
        </div>
      )}

      <div className="player-overlay">
        <div className="player-controls">
          {/* Play/Pause */}
          <button
            className="player-controls__btn"
            onClick={(e) => { e.stopPropagation(); onPlayPause(); }}
            id="play-pause-btn"
            title="Play/Pause (Space)"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          {/* Time */}
          <span className="player-controls__time" id="player-time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Spacer */}
          <span style={{ flex: 1 }} />

          {/* Volume */}
          <button
            className="player-controls__btn"
            onClick={(e) => { e.stopPropagation(); toggleMute(); }}
            id="volume-toggle-btn"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {volumeIcon}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            onClick={(e) => e.stopPropagation()}
            className="player-controls__volume-slider"
            id="volume-slider"
            title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
          />

          {/* Speed */}
          <div className="player-controls__speed-wrap" onClick={(e) => e.stopPropagation()}>
            <button
              className="player-controls__btn player-controls__btn--text"
              onClick={() => setShowSpeedMenu((p) => !p)}
              id="speed-btn"
              title="Playback Speed"
            >
              {speed}x
            </button>
            {showSpeedMenu && (
              <div className="player-controls__speed-menu" id="speed-menu">
                {SPEED_OPTIONS.map((s) => (
                  <button
                    key={s}
                    className={`player-controls__speed-option ${s === speed ? 'player-controls__speed-option--active' : ''}`}
                    onClick={() => handleSpeedSelect(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button
            className="player-controls__btn"
            onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
            id="fullscreen-btn"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? '⊡' : '⛶'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;

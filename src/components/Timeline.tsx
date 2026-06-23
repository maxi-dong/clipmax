import React, { useRef, useCallback, useEffect, useState } from 'react';
import type { Clip } from '../types';
import { clamp } from '../utils';

interface TimelineProps {
  duration: number;
  currentTime: number;
  clips: Clip[];
  selectedClipId: string | null;
  markIn: number | null;
  markOut: number | null;
  onSeek: (time: number) => void;
  onMarkIn: () => void;
  onMarkOut: () => void;
  onAddClip: () => void;
  onUpdateClip: (id: string, startTime: number, endTime: number) => void;
  onSelectClip: (id: string, seekToStart?: boolean) => void;
  videoSrc: string | null;
}

const Timeline: React.FC<TimelineProps> = ({
  duration,
  currentTime,
  clips,
  selectedClipId,
  markIn,
  markOut,
  onSeek,
  onMarkIn,
  onMarkOut,
  onAddClip,
  onUpdateClip,
  onSelectClip,
  videoSrc,
}) => {
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioDataRef = useRef<Float32Array | null>(null);
  const [zoom, setZoom] = useState(1); // 1 = fit all, higher = zoomed in
  const [scrollOffset, setScrollOffset] = useState(0); // 0..1 range
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draggingHandle, setDraggingHandle] = useState<{
    clipId: string;
    edge: 'start' | 'end';
  } | null>(null);

  // Draw waveform when video source changes
  useEffect(() => {
    if (!videoSrc || !waveformRef.current) return;

    const canvas = waveformRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const audioCtx = new AudioContext();
    fetch(videoSrc)
      .then((res) => res.arrayBuffer())
      .then((buffer) => audioCtx.decodeAudioData(buffer))
      .then((audioBuffer) => {
        const rawData = audioBuffer.getChannelData(0);
        const samples = Math.floor(rect.width * 2); // Higher resolution for zoom
        const blockSize = Math.floor(rawData.length / samples);
        const filteredData = new Float32Array(samples);

        for (let i = 0; i < samples; i++) {
          let sum = 0;
          const start = i * blockSize;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[start + j] || 0);
          }
          filteredData[i] = sum / blockSize;
        }

        const maxVal = Math.max(...filteredData, 0.01);
        for (let i = 0; i < filteredData.length; i++) {
          filteredData[i] /= maxVal;
        }

        audioDataRef.current = filteredData;
        drawWaveform(ctx, filteredData, rect.width, rect.height);
      })
      .catch(() => {
        drawPlaceholderWaveform(ctx, rect.width, rect.height);
      });

    return () => {
      audioCtx.close();
    };
  }, [videoSrc]);

  // Redraw on zoom/scroll changes
  useEffect(() => {
    if (!waveformRef.current || !audioDataRef.current) return;
    const canvas = waveformRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    drawWaveform(ctx, audioDataRef.current, rect.width, rect.height);
  }, [zoom, scrollOffset]);

  const drawWaveform = (
    ctx: CanvasRenderingContext2D,
    data: Float32Array,
    width: number,
    height: number,
  ) => {
    ctx.clearRect(0, 0, width, height);
    const centerY = height / 2;

    const visibleRatio = 1 / zoom;
    const startSample = Math.floor(scrollOffset * data.length);
    const visibleSamples = Math.floor(data.length * visibleRatio);
    const endSample = Math.min(startSample + visibleSamples, data.length);
    const pixelsPerSample = width / (endSample - startSample);

    for (let i = startSample; i < endSample; i++) {
      const x = (i - startSample) * pixelsPerSample;
      const barHeight = data[i] * centerY * 0.85;
      const intensity = data[i];
      const r = Math.floor(108 + intensity * 50);
      const g = Math.floor(92 + intensity * 100);
      const b = Math.floor(231 - intensity * 30);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.4 + intensity * 0.5})`;
      ctx.fillRect(x, centerY - barHeight, Math.max(pixelsPerSample * 0.8, 1), barHeight);
      ctx.fillRect(x, centerY, Math.max(pixelsPerSample * 0.8, 1), barHeight * 0.6);
    }

    // Draw time markers
    ctx.fillStyle = 'var(--text-muted)';
    ctx.font = '10px Inter, sans-serif';
    const totalVisible = duration * visibleRatio;
    const markerInterval = getMarkerInterval(totalVisible);
    const startTime = (scrollOffset * duration);
    const firstMarker = Math.ceil(startTime / markerInterval) * markerInterval;

    for (let t = firstMarker; t < startTime + totalVisible; t += markerInterval) {
      const x = ((t - startTime) / totalVisible) * width;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, 0, 1, height);
      ctx.fillStyle = 'rgba(152,152,176,0.7)';
      ctx.fillText(formatTimecodeShort(t), x + 3, 10);
    }
  };

  const drawPlaceholderWaveform = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => {
    ctx.clearRect(0, 0, width, height);
    const centerY = height / 2;
    for (let i = 0; i < width; i += 2) {
      const val = (Math.sin(i * 0.05) * 0.3 + Math.sin(i * 0.12) * 0.2 + 0.1) * centerY;
      ctx.fillStyle = `rgba(108, 92, 231, 0.3)`;
      ctx.fillRect(i, centerY - val, 1, val);
      ctx.fillRect(i, centerY, 1, val * 0.5);
    }
  };

  // Convert pixel X position to time
  const xToTime = useCallback(
    (clientX: number): number => {
      if (!containerRef.current || duration <= 0) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const ratio = clamp(x / rect.width, 0, 1);
      const visibleRatio = 1 / zoom;
      const startTime = scrollOffset * duration;
      return startTime + ratio * duration * visibleRatio;
    },
    [duration, zoom, scrollOffset],
  );

  // Convert time to percentage position within viewport
  const timeToPercent = useCallback(
    (time: number): string => {
      if (duration <= 0) return '0%';
      const visibleRatio = 1 / zoom;
      const startTime = scrollOffset * duration;
      const endTime = startTime + duration * visibleRatio;
      if (time < startTime || time > endTime) return '-10%'; // offscreen
      const pct = ((time - startTime) / (endTime - startTime)) * 100;
      return `${pct}%`;
    },
    [duration, zoom, scrollOffset],
  );

  // Click to seek
  const handleWaveformClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (draggingHandle) return;
      const time = xToTime(e.clientX);
      onSeek(clamp(time, 0, duration));
    },
    [xToTime, onSeek, duration, draggingHandle],
  );

  // Scrubbing (mouse down + drag on waveform)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      setIsScrubbing(true);
      const time = xToTime(e.clientX);
      onSeek(clamp(time, 0, duration));
    },
    [xToTime, onSeek, duration],
  );

  useEffect(() => {
    if (!isScrubbing && !draggingHandle) return;

    const handleMove = (e: MouseEvent) => {
      if (isScrubbing) {
        const time = xToTime(e.clientX);
        onSeek(clamp(time, 0, duration));
      }
      if (draggingHandle) {
        const time = xToTime(e.clientX);
        const clip = clips.find((c) => c.id === draggingHandle.clipId);
        if (!clip) return;
        if (draggingHandle.edge === 'start') {
          const newStart = clamp(time, 0, clip.endTime - 0.1);
          onUpdateClip(clip.id, newStart, clip.endTime);
        } else {
          const newEnd = clamp(time, clip.startTime + 0.1, duration);
          onUpdateClip(clip.id, clip.startTime, newEnd);
        }
      }
    };

    const handleUp = () => {
      setIsScrubbing(false);
      setDraggingHandle(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isScrubbing, draggingHandle, xToTime, onSeek, duration, clips, onUpdateClip]);

  // Zoom with scroll wheel
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const delta = e.deltaY > 0 ? -0.3 : 0.3;
        setZoom((prev) => clamp(prev + delta * prev * 0.5, 1, 50));
      } else {
        // Scroll horizontally
        const delta = e.deltaY > 0 ? 0.05 : -0.05;
        setScrollOffset((prev) => clamp(prev + delta / zoom, 0, 1 - 1 / zoom));
      }
    },
    [zoom],
  );

  // Handle edge drag start
  const handleEdgeDragStart = useCallback(
    (e: React.MouseEvent, clipId: string, edge: 'start' | 'end') => {
      e.stopPropagation();
      e.preventDefault();
      setDraggingHandle({ clipId, edge });
    },
    [],
  );

  // Playhead & clip region positions
  const playheadPos = timeToPercent(currentTime);

  const canAddClip = markIn !== null && markOut !== null && markOut > markIn;

  return (
    <section className="timeline" id="timeline">
      <div className="timeline__controls">
        <div className="timeline__controls-group">
          <button className="timeline__btn" onClick={onMarkIn} disabled={duration <= 0} id="mark-in-btn" title="Set mark in point">
            Mark In <span className="timeline__kbd">I</span>
          </button>
          <button className="timeline__btn" onClick={onMarkOut} disabled={duration <= 0} id="mark-out-btn" title="Set mark out point">
            Mark Out <span className="timeline__kbd">O</span>
          </button>
          <button
            className={`timeline__btn ${canAddClip ? 'timeline__btn--accent' : ''}`}
            onClick={onAddClip}
            disabled={!canAddClip}
            id="add-clip-btn"
            title="Add clip from marked region"
          >
            + Add Clip <span className="timeline__kbd">E</span>
          </button>
        </div>

        {markIn !== null && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--accent-secondary)' }}>
            IN: {formatTimecodeShort(markIn)}
            {markOut !== null && ` → OUT: ${formatTimecodeShort(markOut)}`}
          </span>
        )}

        <span style={{ flex: 1 }} />

        {/* Shortcut hints inline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', fontSize: '11px', color: 'var(--text-muted)', marginRight: '10px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="timeline__kbd">Space</span> Play/Pause
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="timeline__kbd">←</span><span className="timeline__kbd">→</span> Seek
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="timeline__kbd">⌘</span>+<span className="timeline__kbd">Scroll</span> Zoom
          </span>
        </div>

        {/* Zoom controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} id="timeline-zoom-controls">
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            Zoom
          </span>
          <input
            type="range"
            min="1"
            max="30"
            step="0.5"
            value={zoom}
            onChange={(e) => {
              const newZoom = parseFloat(e.target.value);
              setZoom(newZoom);
              setScrollOffset((prev) => clamp(prev, 0, Math.max(0, 1 - 1 / newZoom)));
            }}
            className="timeline__zoom-slider"
            style={{ width: '80px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            title="Adjust timeline zoom"
            id="timeline-zoom-slider"
          />
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', minWidth: '30px', textAlign: 'right' }} id="zoom-value-label">
            {zoom.toFixed(1)}x
          </span>
          {zoom > 1 && (
            <button
              className="timeline__btn"
              onClick={() => { setZoom(1); setScrollOffset(0); }}
              title="Reset zoom"
              id="reset-zoom-btn"
              style={{ padding: '0 6px', height: '22px', fontSize: '10px' }}
            >
              Fit
            </button>
          )}
        </div>
      </div>

      <div
        className="timeline__waveform"
        ref={containerRef}
        onClick={handleWaveformClick}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        id="waveform-container"
      >
        <canvas ref={waveformRef} className="timeline__waveform-canvas" id="waveform-canvas" />

        {/* Clip regions with drag handles */}
        {clips.map((clip, index) => {
          if (duration <= 0) return null;
          const left = timeToPercent(clip.startTime);
          const right = timeToPercent(clip.endTime);
          const leftNum = parseFloat(left);
          const rightNum = parseFloat(right);
          if (leftNum < -5 && rightNum < -5) return null;
          const widthPct = `${rightNum - leftNum}%`;
          const isSelected = selectedClipId === clip.id;

          return (
            <div
              key={clip.id}
              className={`timeline__clip-region ${isSelected ? 'timeline__clip-region--selected' : ''}`}
              style={{ left, width: widthPct }}
              onClick={() => {
                if (!isSelected) {
                  onSelectClip(clip.id, false); // select but do not seek to start!
                }
              }}
            >
              <span className="timeline__clip-label" title={`#${index + 1} ${clip.name}`}>
                #{index + 1} {clip.name}
              </span>
              {/* Left drag handle */}
              <div
                className="timeline__drag-handle timeline__drag-handle--left"
                onMouseDown={(e) => handleEdgeDragStart(e, clip.id, 'start')}
              />
              {/* Right drag handle */}
              <div
                className="timeline__drag-handle timeline__drag-handle--right"
                onMouseDown={(e) => handleEdgeDragStart(e, clip.id, 'end')}
              />
            </div>
          );
        })}

        {/* Current mark region */}
        {markIn !== null && markOut !== null && duration > 0 && (() => {
          const left = timeToPercent(markIn);
          const right = timeToPercent(markOut);
          const widthPct = `${parseFloat(right) - parseFloat(left)}%`;
          return (
            <div
              className="timeline__clip-region"
              style={{
                left,
                width: widthPct,
                background: 'rgba(0, 206, 201, 0.15)',
                borderColor: 'var(--accent-secondary)',
              }}
            />
          );
        })()}

        {/* Playhead */}
        <div className="timeline__playhead" style={{ left: playheadPos }} />
      </div>

    </section>
  );
};

function formatTimecodeShort(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${String(m).padStart(2, '0')}:${sec.padStart(4, '0')}`;
}

function getMarkerInterval(visibleDuration: number): number {
  if (visibleDuration > 3600) return 300;
  if (visibleDuration > 600) return 60;
  if (visibleDuration > 120) return 30;
  if (visibleDuration > 30) return 10;
  if (visibleDuration > 10) return 5;
  return 1;
}

export default Timeline;

import React, { useState, useCallback, useRef } from 'react';
import type { Clip } from '../types';
import { formatTime } from '../utils';

interface ClipListProps {
  clips: Clip[];
  selectedClipId: string | null;
  onSelectClip: (id: string) => void;
  onDeleteClip: (id: string) => void;
  onRenameClip: (id: string, name: string) => void;
  onReorderClips: (reordered: Clip[]) => void;
  onExport: () => void;
  exportDisabled: boolean;
}

const ClipList: React.FC<ClipListProps> = ({
  clips,
  selectedClipId,
  onSelectClip,
  onDeleteClip,
  onRenameClip,
  onReorderClips,
  onExport,
  exportDisabled,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Drag-to-reorder state
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDoubleClick = useCallback((clip: Clip) => {
    setEditingId(clip.id);
    setEditValue(clip.name);
  }, []);

  const handleRenameSubmit = useCallback(
    (id: string) => {
      const trimmed = editValue.trim();
      if (trimmed) onRenameClip(id, trimmed);
      setEditingId(null);
    },
    [editValue, onRenameClip],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === 'Enter') handleRenameSubmit(id);
      else if (e.key === 'Escape') setEditingId(null);
    },
    [handleRenameSubmit],
  );

  // ---- Drag-to-reorder handlers ----
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
    // Ghost image: use the card itself
    e.dataTransfer.setDragImage(e.currentTarget as HTMLElement, 20, 20);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      setDragOverIndex(null);
      if (dragIndex.current === null || dragIndex.current === dropIndex) return;

      const reordered = [...clips];
      const [removed] = reordered.splice(dragIndex.current, 1);
      reordered.splice(dropIndex, 0, removed);
      onReorderClips(reordered);
      dragIndex.current = null;
    },
    [clips, onReorderClips],
  );

  const handleDragEnd = useCallback(() => {
    dragIndex.current = null;
    setDragOverIndex(null);
  }, []);

  return (
    <aside className="sidebar" id="sidebar">
      <div className="sidebar__header">
        <h2 className="sidebar__title">Clips</h2>
        <span className="sidebar__count" id="clip-count">
          {clips.length}
        </span>
      </div>

      <div className="sidebar__list" id="clip-list">
        {clips.length === 0 ? (
          <div className="sidebar__empty">
            <span className="sidebar__empty-icon">✂️</span>
            <span>Belum ada klip</span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
              Tekan <strong>I</strong> dan <strong>O</strong> untuk mark region,
              lalu <strong>E</strong> untuk tambah klip.
            </span>
          </div>
        ) : (
          clips.map((clip, index) => {
            const isDraggedOver = dragOverIndex === index;
            const isBeingDragged = dragIndex.current === index;

            return (
              <div
                key={clip.id}
                className={`clip-card animate-slideInRight ${
                  selectedClipId === clip.id ? 'clip-card--selected' : ''
                }`}
                style={{
                  animationDelay: `${index * 40}ms`,
                  opacity: isBeingDragged ? 0.4 : 1,
                  transform: isDraggedOver ? 'translateY(2px)' : undefined,
                  borderTopColor: isDraggedOver ? 'var(--accent-secondary)' : undefined,
                  borderTopWidth: isDraggedOver ? '2px' : undefined,
                  transition: 'opacity 0.15s, transform 0.1s, border-color 0.1s',
                  cursor: 'grab',
                }}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => onSelectClip(clip.id)}
                id={`clip-card-${clip.id}`}
                title="Drag untuk mengubah urutan"
              >
                {/* Drag handle indicator */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  padding: '2px 4px',
                  opacity: 0.3,
                  cursor: 'grab',
                  flexShrink: 0,
                }}>
                  <div style={{ width: '12px', height: '2px', background: 'currentColor', borderRadius: '1px' }} />
                  <div style={{ width: '12px', height: '2px', background: 'currentColor', borderRadius: '1px' }} />
                  <div style={{ width: '12px', height: '2px', background: 'currentColor', borderRadius: '1px' }} />
                </div>

                <div className="clip-card__index">{index + 1}</div>
                <div className="clip-card__info">
                  {editingId === clip.id ? (
                    <input
                      className="clip-card__rename-input"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => handleRenameSubmit(clip.id)}
                      onKeyDown={(e) => handleKeyDown(e, clip.id)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      id={`rename-input-${clip.id}`}
                    />
                  ) : (
                    <div
                      className="clip-card__name"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleDoubleClick(clip);
                      }}
                      title="Double-click untuk rename"
                    >
                      {clip.name}
                      {clip.subtitles?.enabled && (
                        <span style={{
                          marginLeft: '6px',
                          fontSize: '9px',
                          background: 'rgba(108, 92, 231, 0.2)',
                          color: 'var(--text-accent)',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          verticalAlign: 'middle',
                        }}>CC</span>
                      )}
                    </div>
                  )}
                  <div className="clip-card__time">
                    {formatTime(clip.startTime)} → {formatTime(clip.endTime)}
                    <span style={{ marginLeft: '6px', color: 'var(--accent-secondary)' }}>
                      ({formatTime(clip.endTime - clip.startTime)})
                    </span>
                  </div>
                </div>
                <button
                  className="clip-card__delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteClip(clip.id);
                  }}
                  title="Hapus klip"
                  id={`delete-clip-${clip.id}`}
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="sidebar__footer">
        <button
          className="export-btn"
          onClick={onExport}
          disabled={exportDisabled}
          id="export-all-btn"
        >
          🚀 Export All ({clips.length})
        </button>
      </div>
    </aside>
  );
};

export default ClipList;

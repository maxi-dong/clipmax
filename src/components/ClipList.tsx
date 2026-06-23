import React, { useState, useCallback } from 'react';
import type { Clip } from '../types';
import { formatTime } from '../utils';

interface ClipListProps {
  clips: Clip[];
  selectedClipId: string | null;
  onSelectClip: (id: string) => void;
  onDeleteClip: (id: string) => void;
  onRenameClip: (id: string, name: string) => void;
  onExport: () => void;
  exportDisabled: boolean;
}

const ClipList: React.FC<ClipListProps> = ({
  clips,
  selectedClipId,
  onSelectClip,
  onDeleteClip,
  onRenameClip,
  onExport,
  exportDisabled,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleDoubleClick = useCallback((clip: Clip) => {
    setEditingId(clip.id);
    setEditValue(clip.name);
  }, []);

  const handleRenameSubmit = useCallback(
    (id: string) => {
      const trimmed = editValue.trim();
      if (trimmed) {
        onRenameClip(id, trimmed);
      }
      setEditingId(null);
    },
    [editValue, onRenameClip],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === 'Enter') {
        handleRenameSubmit(id);
      } else if (e.key === 'Escape') {
        setEditingId(null);
      }
    },
    [handleRenameSubmit],
  );

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
            <span>No clips yet</span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
              Use <strong>I</strong> and <strong>O</strong> to mark a region,
              then <strong>E</strong> to add a clip.
            </span>
          </div>
        ) : (
          clips.map((clip, index) => (
            <div
              key={clip.id}
              className={`clip-card animate-slideInRight ${
                selectedClipId === clip.id ? 'clip-card--selected' : ''
              }`}
              style={{ animationDelay: `${index * 40}ms` }}
              onClick={() => onSelectClip(clip.id)}
              id={`clip-card-${clip.id}`}
            >
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
                    title="Double-click to rename"
                  >
                    {clip.name}
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
                title="Remove clip"
                id={`delete-clip-${clip.id}`}
              >
                ✕
              </button>
            </div>
          ))
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

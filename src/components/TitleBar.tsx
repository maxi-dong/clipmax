import React from 'react';

interface TitleBarProps {
  mode: 'manual' | 'ai';
  onModeChange: (mode: 'manual' | 'ai') => void;
  videoName: string | null;
  onNewProject?: () => void;
  onSaveProject?: () => void;
  onOpenProject?: () => void;
  hasUnsavedChanges?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  historySize?: number;
}

const btnStyle: React.CSSProperties = {
  padding: '6px 11px',
  fontSize: 'var(--font-size-xs)',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  transition: 'background 0.15s, border-color 0.15s',
  whiteSpace: 'nowrap' as const,
};

const TitleBar: React.FC<TitleBarProps> = ({
  mode,
  onModeChange,
  videoName,
  onNewProject,
  onSaveProject,
  onOpenProject,
  hasUnsavedChanges = false,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  historySize = 0,
}) => {
  return (
    <header className="titlebar" id="titlebar">
      <div className="titlebar__brand">
        <div className="titlebar__logo">C</div>
        <span className="titlebar__name">ClipMax</span>
        {videoName && (
          <span style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-muted)',
            marginLeft: '8px',
            maxWidth: '200px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            — {videoName}
            {hasUnsavedChanges && (
              <span style={{ color: 'var(--accent-secondary)', marginLeft: '4px' }} title="Perubahan belum disimpan">●</span>
            )}
          </span>
        )}
      </div>

      <div className="titlebar__center">
        <div className="mode-toggle" id="mode-toggle">
          <button
            className={`mode-toggle__btn ${mode === 'manual' ? 'mode-toggle__btn--active' : ''}`}
            onClick={() => onModeChange('manual')}
            id="mode-manual-btn"
          >
            ✂️ Manual
          </button>
          <button
            className={`mode-toggle__btn ${mode === 'ai' ? 'mode-toggle__btn--active' : ''}`}
            onClick={() => onModeChange('ai')}
            id="mode-ai-btn"
          >
            🤖 AI Mode
          </button>
        </div>
      </div>

      <div className="titlebar__actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Undo / Redo — tampil jika ada video */}
        {videoName && onUndo && onRedo && (
          <div style={{ display: 'flex', gap: '3px', marginRight: '4px' }}>
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title={canUndo ? `Undo (${historySize} steps) — Cmd+Z` : 'Tidak ada yang bisa di-undo'}
              style={{
                ...btnStyle,
                opacity: canUndo ? 1 : 0.35,
                padding: '6px 9px',
                cursor: canUndo ? 'pointer' : 'not-allowed',
              }}
              id="undo-btn"
            >
              ↩
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              title={canRedo ? 'Redo — Cmd+Shift+Z' : 'Tidak ada yang bisa di-redo'}
              style={{
                ...btnStyle,
                opacity: canRedo ? 1 : 0.35,
                padding: '6px 9px',
                cursor: canRedo ? 'pointer' : 'not-allowed',
              }}
              id="redo-btn"
            >
              ↪
            </button>
          </div>
        )}

        {/* Open Project — selalu tampil */}
        {onOpenProject && (
          <button
            className="btn btn--secondary"
            onClick={onOpenProject}
            style={btnStyle}
            title="Buka project yang tersimpan (.clipmax.json)"
            id="open-project-btn"
          >
            📂 Open
          </button>
        )}

        {/* Save Project — hanya tampil jika ada video */}
        {onSaveProject && videoName && (
          <button
            className="btn btn--secondary"
            onClick={onSaveProject}
            style={{
              ...btnStyle,
              borderColor: hasUnsavedChanges ? 'var(--accent-secondary)' : 'var(--border-default)',
              color: hasUnsavedChanges ? 'var(--accent-secondary)' : 'var(--text-primary)',
            }}
            title={hasUnsavedChanges ? 'Ada perubahan yang belum disimpan' : 'Simpan project'}
            id="save-project-btn"
          >
            💾 Save
          </button>
        )}

        {/* New Project */}
        {onNewProject && videoName && (
          <button
            className="btn btn--secondary"
            onClick={onNewProject}
            style={btnStyle}
            title="Mulai project baru"
            id="new-project-btn"
          >
            🆕 New
          </button>
        )}

        <span style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-muted)',
          fontWeight: 500,
          marginLeft: '7px',
        }}>
          v0.1.0
        </span>
      </div>
    </header>
  );
};

export default TitleBar;

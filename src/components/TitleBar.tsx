import React from 'react';

interface TitleBarProps {
  mode: 'manual' | 'ai';
  onModeChange: (mode: 'manual' | 'ai') => void;
  videoName: string | null;
  onNewProject?: () => void;
}

const TitleBar: React.FC<TitleBarProps> = ({ mode, onModeChange, videoName, onNewProject }) => {
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

      <div className="titlebar__actions" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        {onNewProject && videoName && (
          <button 
            className="btn btn--secondary" 
            onClick={onNewProject}
            style={{ 
              padding: '6px 12px', 
              fontSize: 'var(--font-size-xs)', 
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            🆕 New Project
          </button>
        )}
        <span style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-muted)',
          fontWeight: 500,
        }}>
          v0.1.0
        </span>
      </div>
    </header>
  );
};

export default TitleBar;

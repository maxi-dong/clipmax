import React, { useState } from 'react';

interface AIDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAnalyze: (mode: string, options: any) => void;
}

const AIDialog: React.FC<AIDialogProps> = ({ isOpen, onClose, onAnalyze }) => {
  const [mode, setMode] = useState('audio_spike');
  const [keyword, setKeyword] = useState('');
  const [apiKey, setApiKey] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    let options: any = {};
    if (mode === 'keyword') {
      if (!keyword.trim()) return alert("Please enter at least one keyword");
      options.keyword = keyword;
    }
    if (mode === 'openai' || mode === 'gemini') {
      if (!apiKey.trim()) return alert(`Please enter your ${mode === 'openai' ? 'OpenAI' : 'Gemini'} API Key`);
      options.apiKey = apiKey;
    }
    
    onAnalyze(mode, options);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '600px' }}>
        <div className="modal__header">
          <h2>✨ AI Auto-Clipping</h2>
          <button className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="modal__content" style={{ maxHeight: '70vh' }}>
          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label style={{ marginBottom: '8px', display: 'block' }}>Choose AI Detection Method</label>
            <div className="preset-cards">
              <div 
                className={`preset-card ${mode === 'audio_spike' ? 'preset-card--active' : ''}`}
                onClick={() => setMode('audio_spike')}
              >
                <div className="preset-card__icon">🔊</div>
                <div className="preset-card__info">
                  <h4>Audio Spike (Fast, Local)</h4>
                  <p>Analyzes audio track levels using FFmpeg to auto-clip loud highlights (laughter, shouting, reactions).</p>
                </div>
              </div>

              <div 
                className={`preset-card ${mode === 'keyword' ? 'preset-card--active' : ''}`}
                onClick={() => setMode('keyword')}
              >
                <div className="preset-card__icon">🗣️</div>
                <div className="preset-card__info">
                  <h4>Keyword Search (Local STT)</h4>
                  <p>Transcribes the video locally using Whisper and auto-clips whenever trigger keywords are spoken.</p>
                </div>
              </div>

              <div 
                className={`preset-card ${mode === 'gemini' ? 'preset-card--active' : ''}`}
                onClick={() => setMode('gemini')}
              >
                <div className="preset-card__icon">✨</div>
                <div className="preset-card__info">
                  <h4>Gemini 2.0 Audio (Fast Cloud)</h4>
                  <p>Sends video audio directly to Google Gemini for smart, contextual highlight detection.</p>
                </div>
              </div>

              <div 
                className={`preset-card ${mode === 'openai' ? 'preset-card--active' : ''}`}
                onClick={() => setMode('openai')}
              >
                <div className="preset-card__icon">🧠</div>
                <div className="preset-card__info">
                  <h4>OpenAI GPT Context (2-Step Cloud)</h4>
                  <p>Transcribes locally and uploads transcript to GPT for advanced logical flow analysis.</p>
                </div>
              </div>
            </div>
          </div>

          {mode === 'keyword' && (
            <div className="form-group animate-fadeIn" style={{ marginTop: '15px' }}>
              <label>Trigger Keyword (e.g., "Wait", "Crazy", "Boom")</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Enter keyword to search..." 
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
          )}

          {(mode === 'openai' || mode === 'gemini') && (
            <div className="form-group animate-fadeIn" style={{ marginTop: '15px' }}>
              <label>{mode === 'openai' ? 'OpenAI' : 'Gemini'} API Key</label>
              <input 
                type="password" 
                className="form-control" 
                placeholder="Paste API Key here..." 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Your API key remains local and is not saved to any external server.
              </span>
            </div>
          )}
        </div>

        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={handleSubmit}>Start Analysis</button>
        </div>
      </div>
    </div>
  );
};

export default AIDialog;

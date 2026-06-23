import React, { useState } from 'react';

interface ExportDialogProps {
  onClose: () => void;
  onExport: (config: ExportConfig) => void;
  clipCount: number;
}

export interface ExportConfig {
  resolution: string;
  quality: string;
  branding: {
    enabled: boolean;
    logoFile: string | null;
    position: string;
    size: number;
    opacity: number;
    animationMode: string;
  };
  antiDup: {
    enabled: boolean;
    level: string;
  };
  outputDir: string | null;
}

import { open } from '@tauri-apps/plugin-dialog';

const ExportDialog: React.FC<ExportDialogProps> = ({ onClose, onExport, clipCount }) => {
  const [activeTab, setActiveTab] = useState<'format' | 'branding' | 'antidup'>('format');
  const [config, setConfig] = useState<ExportConfig>({
    resolution: '1080p',
    quality: 'High',
    branding: {
      enabled: false,
      logoFile: null,
      position: 'top-right',
      size: 15,
      opacity: 80,
      animationMode: 'static',
    },
    antiDup: {
      enabled: false,
      level: 'medium',
    },
    outputDir: null,
  });

  const handleExportClick = () => {
    onExport(config);
  };

  const updateBranding = (updates: Partial<ExportConfig['branding']>) => {
    setConfig((prev) => ({ ...prev, branding: { ...prev.branding, ...updates } }));
  };

  const updateAntiDup = (updates: Partial<ExportConfig['antiDup']>) => {
    setConfig((prev) => ({ ...prev, antiDup: { ...prev.antiDup, ...updates } }));
  };

  const handleLogoUpload = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Images',
          extensions: ['png', 'svg']
        }]
      });
      if (typeof selected === 'string') {
        updateBranding({ logoFile: selected });
      }
    } catch (err) {
      console.error("Failed to open dialog", err);
    }
  };

  const handleFolderSelect = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (typeof selected === 'string') {
        setConfig(prev => ({ ...prev, outputDir: selected }));
      }
    } catch (err) {
      console.error("Failed to pick folder", err);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} id="export-modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()} id="export-modal">
        <div className="modal__header">
          <h2>Export {clipCount} Clips</h2>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>

        <div className="modal__tabs">
          <button
            className={`modal__tab ${activeTab === 'format' ? 'modal__tab--active' : ''}`}
            onClick={() => setActiveTab('format')}
          >
            ⚙️ Format
          </button>
          <button
            className={`modal__tab ${activeTab === 'branding' ? 'modal__tab--active' : ''}`}
            onClick={() => setActiveTab('branding')}
          >
            🎨 Branding
          </button>
          <button
            className={`modal__tab ${activeTab === 'antidup' ? 'modal__tab--active' : ''}`}
            onClick={() => setActiveTab('antidup')}
          >
            🛡️ AntiDup
          </button>
        </div>

        <div className="modal__content">
          {activeTab === 'format' && (
            <div className="tab-pane animate-fadeIn">
              <div className="form-group">
                <label>Output Folder</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button className="btn btn--secondary" onClick={handleFolderSelect}>
                    Choose Destination
                  </button>
                  <span className="file-name" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {config.outputDir ? config.outputDir : "Default (Beside original video)"}
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label>Resolution</label>
                <select
                  value={config.resolution}
                  onChange={(e) => setConfig({ ...config, resolution: e.target.value })}
                  className="form-control"
                >
                  <option value="original">Original</option>
                  <option value="1080p">1080p (1920x1080)</option>
                  <option value="720p">720p (1280x720)</option>
                  <option value="vertical-1080p">Vertical (1080x1920)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Quality / Bitrate</label>
                <select
                  value={config.quality}
                  onChange={(e) => setConfig({ ...config, quality: e.target.value })}
                  className="form-control"
                >
                  <option value="High">High (CRF 18)</option>
                  <option value="Medium">Medium (CRF 23)</option>
                  <option value="Low">Low (CRF 28)</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'branding' && (
            <div className="tab-pane animate-fadeIn">
              <div className="form-group row">
                <label>Enable Branding</label>
                <input
                  type="checkbox"
                  checked={config.branding.enabled}
                  onChange={(e) => updateBranding({ enabled: e.target.checked })}
                  className="form-toggle"
                />
              </div>

              {config.branding.enabled && (
                <>
                  <div className="form-group">
                    <label>Logo File (PNG/SVG)</label>
                    <button className="btn btn--secondary" onClick={handleLogoUpload} style={{ width: 'fit-content' }}>
                      Browse Logo
                    </button>
                    {config.branding.logoFile && (
                      <span className="file-name" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                        {config.branding.logoFile}
                      </span>
                    )}
                  </div>
                  
                  <div className="form-group">
                    <label>Position</label>
                    <div className="position-grid">
                      {['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'].map((pos) => (
                        <button
                          key={pos}
                          className={`position-btn ${config.branding.position === pos ? 'position-btn--active' : ''}`}
                          onClick={() => updateBranding({ position: pos })}
                          title={pos.replace('-', ' ')}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Animation Mode</label>
                    <select
                      value={config.branding.animationMode}
                      onChange={(e) => updateBranding({ animationMode: e.target.value })}
                      className="form-control"
                    >
                      <option value="static">Static (Diam)</option>
                      <option value="hover">Hover (Melayang Halus)</option>
                      <option value="slide-in">Slide In (Masuk perlahan)</option>
                      <option value="pulsing">Pulsing (Detak Jantung)</option>
                      <option value="hopping">Hopping (Loncat Kecil)</option>
                      <option value="random">Random Mix</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Size ({config.branding.size}%)</label>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      value={config.branding.size}
                      onChange={(e) => updateBranding({ size: parseInt(e.target.value) })}
                      className="form-slider"
                    />
                  </div>

                  <div className="form-group">
                    <label>Opacity ({config.branding.opacity}%)</label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={config.branding.opacity}
                      onChange={(e) => updateBranding({ opacity: parseInt(e.target.value) })}
                      className="form-slider"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'antidup' && (
            <div className="tab-pane animate-fadeIn">
              <div className="form-group row">
                <label>Enable Anti-Duplication AI</label>
                <input
                  type="checkbox"
                  checked={config.antiDup.enabled}
                  onChange={(e) => updateAntiDup({ enabled: e.target.checked })}
                  className="form-toggle"
                />
              </div>

              {config.antiDup.enabled && (
                <div className="preset-cards">
                  {[
                    { id: 'light', icon: '🟢', name: 'Light', desc: 'Cepat. Sedikit speed shift & micro color grade.' },
                    { id: 'medium', icon: '🟡', name: 'Medium', desc: 'Seimbang. Dynamic time remap & camera drift.' },
                    { id: 'aggressive', icon: '🔴', name: 'Aggressive', desc: 'Kuat. Frame blending & lens distortion.' },
                    { id: 'random', icon: '🎲', name: 'Random', desc: 'Kombinasi acak berbeda untuk setiap klip.' },
                  ].map((preset) => (
                    <div
                      key={preset.id}
                      className={`preset-card ${config.antiDup.level === preset.id ? 'preset-card--active' : ''}`}
                      onClick={() => updateAntiDup({ level: preset.id })}
                    >
                      <div className="preset-card__icon">{preset.icon}</div>
                      <div className="preset-card__info">
                        <h4>{preset.name}</h4>
                        <p>{preset.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={handleExportClick}>🚀 Start Export</button>
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;

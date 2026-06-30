import React, { useState, useEffect } from 'react';

interface AIDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAnalyze: (mode: string, options: any) => void;
}

const STORAGE_KEY_PREFIX = 'clipmax_api_key_';

const AIDialog: React.FC<AIDialogProps> = ({ isOpen, onClose, onAnalyze }) => {
  const [mode, setMode] = useState('audio_spike');
  const [keyword, setKeyword] = useState('');
  const [clipDuration, setClipDuration] = useState<number>(30);
  const [splitDuration, setSplitDuration] = useState<number>(60);
  const [apiKey, setApiKey] = useState('');
  const [rememberKey, setRememberKey] = useState(true);
  const [keyCleared, setKeyCleared] = useState(false);

  // Load saved API key when mode changes to a cloud mode
  useEffect(() => {
    if (mode === 'openai' || mode === 'gemini') {
      const saved = localStorage.getItem(STORAGE_KEY_PREFIX + mode) || '';
      setApiKey(saved);
      setKeyCleared(false);
    } else {
      setApiKey('');
    }
  }, [mode]);

  if (!isOpen) return null;

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    if (rememberKey && val.trim()) {
      localStorage.setItem(STORAGE_KEY_PREFIX + mode, val.trim());
    }
  };

  const handleClearKey = () => {
    localStorage.removeItem(STORAGE_KEY_PREFIX + mode);
    setApiKey('');
    setKeyCleared(true);
  };

  const handleRememberToggle = (checked: boolean) => {
    setRememberKey(checked);
    if (!checked) {
      // Hapus key tersimpan saat user uncheck
      localStorage.removeItem(STORAGE_KEY_PREFIX + mode);
    } else if (apiKey.trim()) {
      localStorage.setItem(STORAGE_KEY_PREFIX + mode, apiKey.trim());
    }
  };

  const handleSubmit = () => {
    let options: any = {};
    if (mode === 'keyword') {
      if (!keyword.trim()) return alert('Please enter at least one keyword');
      options.keyword = keyword;
      options.clipDuration = clipDuration;
    }
    if (mode === 'auto_split') {
      if (!splitDuration || splitDuration <= 0) return alert('Please enter a valid duration in seconds');
      options.splitDuration = splitDuration;
    }
    if (mode === 'openai' || mode === 'gemini') {
      if (!apiKey.trim()) return alert(`Please enter your ${mode === 'openai' ? 'OpenAI' : 'Gemini'} API Key`);
      options.apiKey = apiKey;
    }

    onAnalyze(mode, options);
  };

  const modeCards = [
    {
      id: 'audio_spike',
      icon: '🔊',
      title: 'Audio Spike (Fast, Local)',
      desc: 'Analisis level audio menggunakan FFmpeg untuk otomatis klip momen keras (tawa, teriakan, reaksi).',
      requiresKey: false,
    },
    {
      id: 'keyword',
      icon: '🗣️',
      title: 'Keyword Search (Local STT)',
      desc: 'Transkripsi video lokal menggunakan Whisper dan otomatis klip saat kata kunci diucapkan.',
      requiresKey: false,
    },
    {
      id: 'gemini',
      icon: '✨',
      title: 'Gemini 2.0 Audio (Fast Cloud)',
      desc: 'Kirim audio ke Google Gemini untuk deteksi highlight yang cerdas dan kontekstual.',
      requiresKey: true,
    },
    {
      id: 'openai',
      icon: '🧠',
      title: 'OpenAI GPT Context (2-Step Cloud)',
      desc: 'Transkripsi lokal lalu analisis transcript ke GPT untuk memahami alur logis konten.',
      requiresKey: true,
    },
  ];

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '600px' }}>
        <div className="modal__header">
          <h2>✨ AI Auto-Clipping</h2>
          <button className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="modal__content" style={{ maxHeight: '70vh' }}>
          {/* Mode cards */}
          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label style={{ marginBottom: '8px', display: 'block' }}>Pilih Metode Deteksi AI</label>
            <div className="preset-cards">
              {modeCards.map((card) => (
                <div
                  key={card.id}
                  className={`preset-card ${mode === card.id ? 'preset-card--active' : ''}`}
                  onClick={() => setMode(card.id)}
                >
                  <div className="preset-card__icon">{card.icon}</div>
                  <div className="preset-card__info">
                    <h4>{card.title}</h4>
                    <p>{card.desc}</p>
                  </div>
                  {card.requiresKey && localStorage.getItem(STORAGE_KEY_PREFIX + card.id) && (
                    <span title="API key tersimpan" style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      fontSize: '10px',
                      background: 'rgba(16, 172, 132, 0.2)',
                      color: '#1dd1a1',
                      borderRadius: '4px',
                      padding: '1px 5px',
                    }}>🔑 saved</span>
                  )}
                </div>
              ))}
            </div>

            {/* Auto split card */}
            <div className="preset-grid" style={{ marginTop: '10px' }}>
              <div
                className={`preset-card ${mode === 'auto_split' ? 'preset-card--active' : ''}`}
                onClick={() => setMode('auto_split')}
              >
                <div className="preset-card__icon">✂️</div>
                <div className="preset-card__info">
                  <h4>Auto Split (Fixed Duration)</h4>
                  <p>Potong otomatis seluruh video menjadi bagian-bagian berdurasi sama.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Keyword options */}
          {mode === 'keyword' && (
            <div className="form-group animate-fadeIn" style={{ marginTop: '15px' }}>
              <label>Kata Kunci Pemicu (contoh: "Wait", "Crazy", "Boom")</label>
              <input
                type="text"
                className="form-control"
                placeholder="Pisahkan beberapa kata kunci dengan koma..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                style={{ marginBottom: '15px' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label>Durasi Total Klip</label>
                <select
                  className="form-control"
                  value={clipDuration}
                  onChange={(e) => setClipDuration(parseInt(e.target.value) || 30)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value={15}>15 Detik</option>
                  <option value={20}>20 Detik</option>
                  <option value={30}>30 Detik</option>
                  <option value={45}>45 Detik</option>
                  <option value={60}>60 Detik</option>
                  <option value={90}>90 Detik</option>
                </select>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Klip dimulai 2 detik sebelum kata kunci diucapkan.
                </div>
              </div>
            </div>
          )}

          {/* Auto split options */}
          {mode === 'auto_split' && (
            <div className="form-group animate-fadeIn" style={{ marginTop: '15px' }}>
              <label>Durasi Per Klip (detik)</label>
              <input
                type="number"
                className="form-control"
                value={splitDuration}
                min="1"
                onChange={(e) => setSplitDuration(parseInt(e.target.value) || 60)}
                placeholder="contoh: 60"
                style={{ marginBottom: '5px' }}
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Video akan dipotong secara berurutan hingga habis.
              </div>
            </div>
          )}

          {/* API Key options (Gemini / OpenAI) */}
          {(mode === 'openai' || mode === 'gemini') && (
            <div className="form-group animate-fadeIn" style={{ marginTop: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ marginBottom: 0 }}>
                  {mode === 'openai' ? 'OpenAI' : 'Gemini'} API Key
                </label>
                {localStorage.getItem(STORAGE_KEY_PREFIX + mode) && !keyCleared && (
                  <button
                    onClick={handleClearKey}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      textDecoration: 'underline',
                    }}
                  >
                    Hapus key tersimpan
                  </button>
                )}
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Tempel API Key di sini..."
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  style={{ paddingRight: '36px' }}
                />
                {apiKey && (
                  <span style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '14px',
                    opacity: 0.6,
                  }} title="API key tidak dikirim ke server manapun selain provider AI yang kamu pilih">
                    🔒
                  </span>
                )}
              </div>

              {/* Remember toggle */}
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '10px',
                cursor: 'pointer',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={rememberKey}
                  onChange={(e) => handleRememberToggle(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Ingat API key di perangkat ini
                {rememberKey && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    (disimpan lokal, tidak dikirim ke server ClipMax)
                  </span>
                )}
              </label>
            </div>
          )}
        </div>

        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={onClose}>Batal</button>
          <button className="btn btn--primary" onClick={handleSubmit}>Mulai Analisis</button>
        </div>
      </div>
    </div>
  );
};

export default AIDialog;

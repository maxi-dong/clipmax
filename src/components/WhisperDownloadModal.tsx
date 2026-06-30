import React from 'react';

interface WhisperDownloadModalProps {
  progress: number;       // 0–100
  downloadedMb: number;
  totalMb: number;
  onCancel: () => void;
}

const WhisperDownloadModal: React.FC<WhisperDownloadModalProps> = ({
  progress,
  downloadedMb,
  totalMb,
  onCancel,
}) => {
  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="modal" style={{ width: '460px', padding: '32px', textAlign: 'center' }}>
        {/* Icon */}
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>

        <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700 }}>
          Mengunduh Model Whisper
        </h2>
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '13px',
          lineHeight: 1.6,
          margin: '0 0 24px',
        }}>
          Whisper adalah model AI untuk transkripsi suara yang berjalan <strong>100% lokal</strong> di perangkatmu — tanpa biaya API, tanpa upload ke server.
          <br /><br />
          Model ini hanya perlu diunduh <strong>sekali saja</strong> (~150 MB).
        </p>

        {/* Progress bar */}
        <div style={{
          background: 'var(--bg-tertiary)',
          borderRadius: '100px',
          height: '10px',
          width: '100%',
          overflow: 'hidden',
          marginBottom: '12px',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.min(progress, 100)}%`,
            background: 'linear-gradient(90deg, #6c5ce7, #a29bfe)',
            borderRadius: '100px',
            transition: 'width 0.4s ease',
          }} />
        </div>

        {/* Stats row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: 'var(--text-muted)',
          marginBottom: '24px',
        }}>
          <span>{downloadedMb.toFixed(1)} MB / {totalMb.toFixed(0)} MB</span>
          <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{Math.round(progress)}%</span>
        </div>

        {/* Animated dots */}
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '20px' }}>
          {progress < 100 ? 'Mengunduh, mohon tunggu' : 'Selesai! Memulai analisis...'}
          {progress < 100 && (
            <span className="animate-pulse" style={{ letterSpacing: '3px' }}>...</span>
          )}
        </p>

        <button
          className="btn btn--secondary"
          onClick={onCancel}
          style={{ fontSize: '13px', padding: '8px 20px', opacity: 0.7 }}
        >
          Batalkan
        </button>
      </div>
    </div>
  );
};

export default WhisperDownloadModal;

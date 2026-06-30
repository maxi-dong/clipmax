import React, { useState, useEffect } from 'react';
import type { Clip, SubtitleConfig, Word } from '../types';
import { invoke } from '@tauri-apps/api/core';

interface SubtitleEditorProps {
  clip: Clip;
  videoPath: string | null;
  onUpdate: (updatedClip: Clip) => void;
  onClose?: () => void;
  onApplyToAll?: (config: SubtitleConfig) => void;
}

const DEFAULT_SUBTITLE_CONFIG: SubtitleConfig = {
  enabled: false,
  style: 'karaoke',
  fontFamily: 'Arial',
  fontSize: 48,
  fontColor: '#FFFFFF',
  borderColor: '#000000',
  borderWidth: 3,
  marginBottom: 100,
  maxWordsPerLine: 4,
  words: []
};

const SubtitleEditor: React.FC<SubtitleEditorProps> = ({ clip, videoPath, onUpdate, onClose, onApplyToAll }) => {
  const [config, setConfig] = useState<SubtitleConfig>(clip.subtitles || DEFAULT_SUBTITLE_CONFIG);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'transcript' | 'style'>('transcript');
  const [isFullScreenEditorOpen, setIsFullScreenEditorOpen] = useState(false);
  const [fontColorInput, setFontColorInput] = useState(config.fontColor);
  const [borderColorInput, setBorderColorInput] = useState(config.borderColor);

  useEffect(() => {
    setConfig(clip.subtitles || DEFAULT_SUBTITLE_CONFIG);
  }, [clip.id]); // Update when clip changes

  useEffect(() => {
    setFontColorInput(config.fontColor);
  }, [config.fontColor]);

  useEffect(() => {
    setBorderColorInput(config.borderColor);
  }, [config.borderColor]);

  const handleChange = (key: keyof SubtitleConfig, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    onUpdate({ ...clip, subtitles: newConfig });
  };

  const handleWordChange = (index: number, newWord: string) => {
    const newWords = [...config.words];
    newWords[index].word = newWord;
    handleChange('words', newWords);
  };

  const handleGenerate = async () => {
    if (!videoPath) return alert('Video path not found.');
    setIsGenerating(true);
    try {
      const transcript = await invoke<string>('generate_clip_transcript', {
        videoPath,
        startTime: clip.startTime,
        endTime: clip.endTime
      });
      
      const parsed = JSON.parse(transcript);
      const segments = parsed.transcription || [];
      const newWords: Word[] = [];

      // Whisper outputs segments containing words if -ml 1 or tokens are parsed
      // We will parse the segments assuming each segment has a few words or is a word
      for (const seg of segments) {
         if (!seg.text) continue;
         const start = (seg.offsets?.from || 0) / 1000;
         const end = (seg.offsets?.to || 0) / 1000;
         
         // If whisper didn't give word-level timings directly in the expected format, 
         // we split the segment text and roughly divide the time
         const text = seg.text.trim();
         if (!text) continue;
         
         // Try to use per-token/word timings if available in whisper.cpp output
         if (seg.tokens && seg.tokens.length > 0) {
             let currentWord = "";
             let wordStart = start;
             
             for (let i = 0; i < seg.tokens.length; i++) {
                 const t = seg.tokens[i];
                 const tText = t.text.trim();
                 
                 if (tText) {
                    currentWord += (currentWord ? " " : "") + tText;
                 }
                 
                 // If token contains a space at the end or it's the last token, push the word
                 if (t.text.endsWith(" ") || i === seg.tokens.length - 1) {
                     if (currentWord) {
                         newWords.push({
                             word: currentWord.trim(),
                             start: wordStart,
                             end: end // rough estimate if no token-level timestamps
                         });
                         currentWord = "";
                         wordStart = end; // approximate
                     }
                 }
             }
         } else {
             // Fallback: Just push the whole segment as a single "word" chunk 
             // (if -ml 1 didn't work perfectly)
             const chunks = text.split(" ");
             const timePerWord = (end - start) / chunks.length;
             chunks.forEach((w: string, i: number) => {
                newWords.push({
                   word: w,
                   start: start + (i * timePerWord),
                   end: start + ((i + 1) * timePerWord)
                });
             });
         }
      }

      handleChange('words', newWords);
    } catch (e) {
      alert("Failed to generate subtitles: " + e);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ 
      background: 'var(--bg-surface)', 
      border: '1px solid var(--border-default)', 
      borderRadius: 'var(--radius-lg)', 
      overflow: 'hidden', 
      marginTop: '15px'
    }}>
      {/* Merged Header & Tabs */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '8px 15px', 
        background: 'var(--bg-elevated)', 
        borderBottom: '1px solid var(--border-subtle)',
        height: '44px'
      }}>
        {/* Left: Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px' }}>📝</span>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', fontWeight: 700 }}>
            Subtitle Studio
          </span>
        </div>

        {/* Middle: Compact Segmented Tab Control (only visible if enabled) */}
        {config.enabled ? (
          <div style={{ 
            display: 'flex', 
            background: 'rgba(255, 255, 255, 0.04)', 
            borderRadius: '6px', 
            padding: '2px',
            border: '1px solid var(--border-subtle)'
          }}>
            <button 
              onClick={() => setActiveTab('transcript')}
              style={{
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                background: activeTab === 'transcript' ? 'var(--accent-primary)' : 'transparent',
                color: activeTab === 'transcript' ? 'white' : 'var(--text-secondary)',
                transition: 'all var(--transition-fast)'
              }}
            >
              Transcript
            </button>
            <button 
              onClick={() => setActiveTab('style')}
              style={{
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                background: activeTab === 'style' ? 'var(--accent-primary)' : 'transparent',
                color: activeTab === 'style' ? 'white' : 'var(--text-secondary)',
                transition: 'all var(--transition-fast)'
              }}
            >
              Style Settings
            </button>
          </div>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Disabled</span>
        )}

        {/* Right: Enable toggle & Close button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              className="form-toggle"
              checked={config.enabled} 
              onChange={(e) => handleChange('enabled', e.target.checked)}
            />
            <strong style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-xs)' }}>Enable</strong>
          </label>

          {onClose && (
            <>
              <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} />
              <button 
                onClick={onClose}
                title="Close Studio"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px',
                  borderRadius: '4px',
                  transition: 'all var(--transition-fast)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>

      {config.enabled && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>

          {/* Content Area */}
          <div style={{ padding: '15px' }}>
            {activeTab === 'transcript' && (
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button 
                    className="btn btn--primary" 
                    onClick={handleGenerate} 
                    disabled={isGenerating}
                    style={{ padding: '10px 16px', minWidth: '150px' }}
                  >
                    {isGenerating ? '⏳ Generating...' : '🤖 Auto Generate'}
                  </button>
                  {config.words.length > 0 && (
                    <button 
                      className="btn btn--secondary" 
                      onClick={() => setIsFullScreenEditorOpen(true)}
                      style={{ padding: '8px 16px', fontSize: 'var(--font-size-xs)' }}
                    >
                      🔍 Edit Full Screen
                    </button>
                  )}
                </div>

                <div style={{ flexGrow: 1 }}>
                  {config.words.length === 0 ? (
                    <div style={{ 
                      padding: '10px 15px', 
                      textAlign: 'center', 
                      background: 'var(--bg-elevated)', 
                      borderRadius: 'var(--radius-md)',
                      border: '1px dashed var(--border-default)'
                    }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
                        No transcript yet. Click Auto Generate to begin.
                      </span>
                    </div>
                  ) : (
                    <div style={{ 
                      maxHeight: '60px', 
                      overflowY: 'auto', 
                      background: 'var(--bg-elevated)', 
                      padding: '8px', 
                      borderRadius: 'var(--radius-md)', 
                      border: '1px solid var(--border-default)',
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: '6px' 
                    }}>
                      {config.words.map((w, i) => (
                        <input 
                          key={i}
                          type="text" 
                          value={w.word}
                          onChange={e => handleWordChange(i, e.target.value)}
                          className="form-control"
                          style={{ 
                            padding: '4px 8px', 
                            fontSize: 'var(--font-size-xs)',
                            height: '26px',
                            width: Math.max(55, w.word.length * 8 + 15) + 'px', 
                            textAlign: 'center',
                            borderRadius: '4px'
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'style' && (
              <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {/* Style */}
                <div className="form-group" style={{ flex: '1 1 140px' }}>
                  <label>Style Mode</label>
                  <select 
                    className="form-control" 
                    value={config.style} 
                    onChange={e => handleChange('style', e.target.value)}
                    style={{ height: '36px', padding: '6px 12px' }}
                  >
                    <option value="sentence">Standard (Per Line)</option>
                    <option value="karaoke">Karaoke (Word by Word)</option>
                  </select>
                </div>

                {/* Font Family */}
                <div className="form-group" style={{ flex: '1 1 180px' }}>
                  <label>Font Family</label>
                  <select 
                    className="form-control" 
                    value={config.fontFamily || 'Arial'} 
                    onChange={e => handleChange('fontFamily', e.target.value)}
                    style={{ height: '36px', padding: '6px 12px' }}
                  >
                    <option value="Arial">Arial (Standard Sans-Serif)</option>
                    <option value="Arial Black">Arial Black (Heavy Sans-Serif)</option>
                    <option value="Impact">Impact (TikTok Bold Caption)</option>
                    <option value="Helvetica">Helvetica (Modern macOS)</option>
                    <option value="Montserrat">Montserrat (Premium Sans-Serif)</option>
                    <option value="Anton">Anton (Solid Ultra-Bold)</option>
                    <option value="Futura">Futura (Geometric Sans-Serif)</option>
                    <option value="Trebuchet MS">Trebuchet MS (Highly Legible)</option>
                    <option value="Verdana">Verdana (Readable Screen Font)</option>
                    <option value="Tahoma">Tahoma (Compact Sans-Serif)</option>
                    <option value="Courier New">Courier New (Sleek Monospace)</option>
                    <option value="Georgia">Georgia (Premium Serif)</option>
                    <option value="Times New Roman">Times New Roman (Standard Serif)</option>
                    <option value="Comic Sans MS">Comic Sans MS (Playful)</option>
                    <option value="Brush Script MT">Brush Script MT (Script/Handwritten)</option>
                  </select>
                </div>

                {/* Words per Line */}
                <div className="form-group" style={{ flex: '1 1 90px' }}>
                  <label>Words / Line</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="15" 
                    className="form-control" 
                    value={config.maxWordsPerLine} 
                    onChange={e => handleChange('maxWordsPerLine', parseInt(e.target.value))} 
                    style={{ height: '36px' }}
                  />
                </div>

                {/* Font Size */}
                <div className="form-group" style={{ flex: '1 1 90px' }}>
                  <label>Font Size (px)</label>
                  <input 
                    type="number" 
                    min="10" 
                    max="150" 
                    className="form-control" 
                    value={config.fontSize} 
                    onChange={e => handleChange('fontSize', parseInt(e.target.value))} 
                    style={{ height: '36px' }}
                  />
                </div>

                {/* Margin Bottom */}
                <div className="form-group" style={{ flex: '1 1 90px' }}>
                  <label>Margin Bot (px)</label>
                  <input 
                    type="number" 
                    min="0" 
                    max="500" 
                    className="form-control" 
                    value={config.marginBottom} 
                    onChange={e => handleChange('marginBottom', parseInt(e.target.value))} 
                    style={{ height: '36px' }}
                  />
                </div>

                {/* Text Color group */}
                <div className="form-group" style={{ flex: '1 1 125px' }}>
                  <label>Text Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', height: '36px' }}>
                    <input 
                      type="color" 
                      value={config.fontColor} 
                      onChange={e => handleChange('fontColor', e.target.value)} 
                      style={{ 
                        width: '24px', 
                        height: '24px', 
                        padding: 0, 
                        border: '1px solid rgba(255, 255, 255, 0.2)', 
                        borderRadius: '4px',
                        background: 'transparent', 
                        cursor: 'pointer'
                      }} 
                    />
                    <input 
                      type="text" 
                      value={fontColorInput.toUpperCase()} 
                      onChange={e => {
                        const val = e.target.value;
                        setFontColorInput(val);
                        if (val.match(/^#[0-9A-Fa-f]{6}$/)) {
                          handleChange('fontColor', val);
                        }
                      }} 
                      style={{ 
                        background: 'transparent', 
                        border: 'none', 
                        color: 'var(--text-primary)', 
                        fontSize: 'var(--font-size-xs)', 
                        width: '60px',
                        padding: 0,
                        fontFamily: 'monospace',
                        outline: 'none'
                      }} 
                    />
                  </div>
                </div>

                {/* Border Color group */}
                <div className="form-group" style={{ flex: '1 1 125px' }}>
                  <label>Border Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', height: '36px' }}>
                    <input 
                      type="color" 
                      value={config.borderColor} 
                      onChange={e => handleChange('borderColor', e.target.value)} 
                      style={{ 
                        width: '24px', 
                        height: '24px', 
                        padding: 0, 
                        border: '1px solid rgba(255, 255, 255, 0.2)', 
                        borderRadius: '4px',
                        background: 'transparent', 
                        cursor: 'pointer'
                      }} 
                    />
                    <input 
                      type="text" 
                      value={borderColorInput.toUpperCase()} 
                      onChange={e => {
                        const val = e.target.value;
                        setBorderColorInput(val);
                        if (val.match(/^#[0-9A-Fa-f]{6}$/)) {
                          handleChange('borderColor', val);
                        }
                      }} 
                      style={{ 
                        background: 'transparent', 
                        border: 'none', 
                        color: 'var(--text-primary)', 
                        fontSize: 'var(--font-size-xs)', 
                        width: '60px',
                        padding: 0,
                        fontFamily: 'monospace',
                        outline: 'none'
                      }} 
                    />
                  </div>
                </div>

                <div className="form-group" style={{ flex: '1 1 100px' }}>
                  <label>Border Size (px)</label>
                  <input 
                    type="number" 
                    min="0" 
                    max="20" 
                    className="form-control" 
                    value={config.borderWidth} 
                    onChange={e => handleChange('borderWidth', parseInt(e.target.value) || 0)} 
                    style={{ height: '36px' }}
                  />
                </div>
              </div>
            )}

            {onApplyToAll && (
              <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--border-subtle)' }}>
                <button 
                  className="btn btn--secondary" 
                  onClick={() => onApplyToAll(config)}
                  style={{ width: '100%', background: 'linear-gradient(45deg, #10ac84, #1dd1a1)', color: 'white', border: 'none' }}
                >
                  ✨ Apply to All Clips
                </button>
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '5px', marginBottom: 0 }}>
                  Applies style to all clips and auto-transcribes clips without text.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {isFullScreenEditorOpen && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ width: '90vw', maxWidth: '1000px', height: '80vh', display: 'flex', flexDirection: 'column', padding: '25px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>🔍 Transcript Editor (Full Screen)</h2>
              <button className="btn btn--secondary" onClick={() => setIsFullScreenEditorOpen(false)}>Close</button>
            </div>
            
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginTop: 0, marginBottom: '15px', textAlign: 'left' }}>
              Edit words directly below. Timestamps are displayed below each word for precision.
            </p>

            <div style={{ 
              flex: 1, 
              overflowY: 'auto', 
              background: 'var(--bg-elevated)', 
              padding: '20px', 
              borderRadius: 'var(--radius-lg)', 
              border: '1px solid var(--border-default)',
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: '10px 8px',
              alignContent: 'flex-start'
            }}>
              {config.words.map((w, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                  <input 
                    type="text" 
                    value={w.word}
                    onChange={e => handleWordChange(i, e.target.value)}
                    className="form-control"
                    style={{ 
                      padding: '6px 10px', 
                      fontSize: 'var(--font-size-sm)',
                      height: '32px',
                      width: Math.max(70, w.word.length * 9 + 20) + 'px', 
                      textAlign: 'center',
                      borderRadius: '4px'
                    }}
                  />
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                    {w.start.toFixed(1)}s
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn btn--primary" onClick={() => setIsFullScreenEditorOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubtitleEditor;

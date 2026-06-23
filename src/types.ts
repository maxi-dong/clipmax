/** Core types for ClipMax */

export interface Word {
  word: string;
  start: number; // in seconds
  end: number;   // in seconds
}

export interface SubtitleConfig {
  enabled: boolean;
  style: 'sentence' | 'karaoke';
  fontFamily: string;
  fontSize: number;
  fontColor: string; // Hex format e.g. #FFFFFF
  borderColor: string; 
  borderWidth: number;
  marginBottom: number;
  maxWordsPerLine: number;
  words: Word[];
}

export interface Clip {
  id: string;
  name: string;
  startTime: number; // seconds
  endTime: number;   // seconds
  subtitles?: SubtitleConfig;
}

export interface VideoFile {
  name: string;
  path: string;       // local file path or object URL
  duration: number;    // seconds
  size: number;        // bytes
}

export interface TranscriptSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  isHighlight?: boolean;
}

export type AppMode = 'manual' | 'ai';
export type ExportStatus = 'idle' | 'exporting' | 'done' | 'error';

export interface AppState {
  mode: AppMode;
  video: VideoFile | null;
  clips: Clip[];
  selectedClipId: string | null;
  currentTime: number;
  isPlaying: boolean;
  markIn: number | null;
  markOut: number | null;
  transcript: TranscriptSegment[];
  exportStatus: ExportStatus;
  exportProgress: number; // 0 to 1
  isDragOver: boolean;
}

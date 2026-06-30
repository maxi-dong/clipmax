/**
 * project.ts — ClipMax Project File Serialization
 *
 * Project files are saved as `.clipmax.json` and contain:
 * - video path reference
 * - all clip definitions (including subtitle configs)
 */

import type { Clip } from './types';

export const PROJECT_VERSION = 1;

export interface ProjectFile {
  version: number;
  savedAt: string; // ISO 8601 timestamp
  videoPath: string;
  videoName: string;
  clips: Clip[];
}

/** Serialize current app state into a ProjectFile object */
export function serializeProject(
  videoPath: string,
  videoName: string,
  clips: Clip[],
): ProjectFile {
  return {
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    videoPath,
    videoName,
    clips,
  };
}

/**
 * Parse and validate a JSON string as a ProjectFile.
 * Returns the project on success, throws an Error with a user-friendly message on failure.
 */
export function deserializeProject(raw: string): ProjectFile {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('File tidak valid — bukan JSON yang bisa dibaca.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Format project file tidak dikenali.');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.version !== 'number') {
    throw new Error('File project tidak memiliki field version yang valid.');
  }

  if (obj.version > PROJECT_VERSION) {
    throw new Error(
      `Project file dibuat dengan versi ClipMax yang lebih baru (v${obj.version}). Perbarui ClipMax terlebih dahulu.`,
    );
  }

  if (typeof obj.videoPath !== 'string' || !obj.videoPath) {
    throw new Error('Project file tidak memiliki path video yang valid.');
  }

  if (typeof obj.videoName !== 'string') {
    throw new Error('Project file tidak memiliki nama video.');
  }

  if (!Array.isArray(obj.clips)) {
    throw new Error('Project file tidak memiliki daftar klip yang valid.');
  }

  return {
    version: obj.version,
    savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : new Date().toISOString(),
    videoPath: obj.videoPath,
    videoName: obj.videoName,
    clips: obj.clips as Clip[],
  };
}

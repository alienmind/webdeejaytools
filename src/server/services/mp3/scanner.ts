import fs from 'fs';
import path from 'path';
import * as musicMetadata from 'music-metadata';
import { LocalTrackItem, ScanDirectoryResult } from '../../../shared/types.js';

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.wav',
  '.aiff',
  '.aif',
  '.m4a',
  '.ogg',
  '.wma',
  '.aac',
  '.opus',
]);

/**
 * Extracts BPM from music-metadata common or native frames.
 */
function extractBpm(metadata: musicMetadata.IAudioMetadata): number | undefined {
  if (typeof metadata.common.bpm === 'number' && !isNaN(metadata.common.bpm)) {
    return Math.round(metadata.common.bpm);
  }
  if (typeof (metadata.common as any).bpm === 'string') {
    const parsed = parseFloat((metadata.common as any).bpm);
    if (!isNaN(parsed)) return Math.round(parsed);
  }

  // Check native frames for TBPM or BPM
  for (const tagType of Object.keys(metadata.native || {})) {
    const tags = metadata.native[tagType];
    for (const tag of tags) {
      if (tag.id === 'TBPM' || tag.id.toUpperCase() === 'BPM') {
        const val = typeof tag.value === 'string' ? parseFloat(tag.value) : Number(tag.value);
        if (!isNaN(val)) return Math.round(val);
      }
    }
  }

  return undefined;
}

/**
 * Extracts Musical Key (e.g. "8A", "Am", "F#m", "11B") from metadata.
 */
function extractKey(metadata: musicMetadata.IAudioMetadata): string | undefined {
  if ((metadata.common as any).key) {
    return String((metadata.common as any).key).trim();
  }

  // Check native frames for TKEY or INITIALKEY or KEY
  for (const tagType of Object.keys(metadata.native || {})) {
    const tags = metadata.native[tagType];
    for (const tag of tags) {
      const upperId = tag.id.toUpperCase();
      if (upperId === 'TKEY' || upperId === 'INITIALKEY' || upperId === 'KEY') {
        if (typeof tag.value === 'string' && tag.value.trim()) {
          return tag.value.trim();
        }
      }
    }
  }

  return undefined;
}

/**
 * Parses track title, artist, and album from filename and parent folder if tags are absent.
 * e.g. "04 - Peace Corrosion.flac" -> title: "Peace Corrosion"
 * e.g. "Daft Punk - Discovery (2001)" -> artist: "Daft Punk", album: "Discovery (2001)"
 */
function fallbackTrackInfo(fileNameWithoutExt: string, parentDirName: string): { title: string; artist: string; album?: string } {
  const cleanBase = fileNameWithoutExt.replace(/^\d+[\s._-]+/, '').trim();
  let artist = 'Unknown Artist';
  let album = '';
  let title = cleanBase || fileNameWithoutExt;

  if (parentDirName && parentDirName.includes(' - ')) {
    const parentParts = parentDirName.split(' - ');
    artist = parentParts[0].trim();
    album = parentParts.slice(1).join(' - ').trim();
  } else if (parentDirName) {
    album = parentDirName;
  }

  if (cleanBase.includes(' - ')) {
    const parts = cleanBase.split(' - ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim() || cleanBase;
  }

  return { artist, album, title };
}

/**
 * Recursively scans a directory for audio files and extracts metadata.
 */
export async function scanLocalDirectory(rootDirectory: string): Promise<ScanDirectoryResult> {
  const resolvedRoot = path.resolve(rootDirectory);
  if (!fs.existsSync(resolvedRoot)) {
    throw new Error(`Directory does not exist: ${resolvedRoot}`);
  }

  const audioFiles: string[] = [];

  async function walkDir(currentDir: string): Promise<void> {
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_AUDIO_EXTENSIONS.has(ext)) {
          audioFiles.push(fullPath);
        }
      }
    }
  }

  await walkDir(resolvedRoot);

  const tracks: LocalTrackItem[] = [];

  for (let i = 0; i < audioFiles.length; i++) {
    const filePath = audioFiles[i];
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName).toLowerCase();
    const fileNameWithoutExt = path.basename(fileName, ext);
    const relativeSubPath = path.relative(resolvedRoot, filePath);
    const parentDirName = path.basename(path.dirname(filePath));

    try {
      const stats = await fs.promises.stat(filePath);
      let meta: musicMetadata.IAudioMetadata | null = null;

      try {
        meta = await musicMetadata.parseFile(filePath, { duration: true });
      } catch {
        // Fallback gracefully for untagged / mock files
      }

      const fallback = fallbackTrackInfo(fileNameWithoutExt, parentDirName !== path.basename(resolvedRoot) ? parentDirName : '');
      const title = meta?.common.title?.trim() || fallback.title;
      const artist = meta?.common.artist?.trim() || meta?.common.artists?.[0]?.trim() || fallback.artist;
      const album = meta?.common.album?.trim() || fallback.album || (parentDirName !== path.basename(resolvedRoot) ? parentDirName : '');
      const year = meta?.common.year || meta?.common.originalyear || undefined;
      const trackNumber = meta?.common.track?.no || undefined;
      const durationSec = meta?.format.duration ? Math.round(meta.format.duration) : undefined;
      const bpm = meta ? extractBpm(meta) : undefined;
      const key = meta ? extractKey(meta) : undefined;
      const bitrate = meta?.format.bitrate ? Math.round(meta.format.bitrate / 1000) : undefined;
      const sampleRate = meta?.format.sampleRate || undefined;
      const lossless = meta?.format.lossless ?? (ext === '.flac' || ext === '.wav' || ext === '.aiff' || ext === '.aif');
      const hasArtwork = Boolean(meta?.common.picture && meta.common.picture.length > 0);

      tracks.push({
        id: `track_${i}_${Buffer.from(relativeSubPath).toString('base64url').slice(0, 16)}`,
        filePath,
        fileName,
        relativeSubPath,
        fileSize: stats.size,
        extension: ext,
        title,
        artist,
        album,
        year,
        trackNumber,
        durationSec,
        bpm,
        key,
        bitrate,
        sampleRate,
        lossless,
        hasArtwork,
      });
    } catch (fileErr) {
      console.error(`[Scanner] Error reading file ${filePath}:`, fileErr);
    }
  }

  return {
    directory: resolvedRoot,
    totalFiles: tracks.length,
    tracks,
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Extracts embedded artwork buffer from an audio file.
 */
export async function getTrackArtwork(filePath: string): Promise<{ data: Buffer; mimeType: string } | null> {
  try {
    if (!fs.existsSync(filePath)) return null;
    const meta = await musicMetadata.parseFile(filePath);
    if (meta.common.picture && meta.common.picture.length > 0) {
      const pic = meta.common.picture[0];
      return {
        data: Buffer.from(pic.data),
        mimeType: pic.format || 'image/jpeg',
      };
    }
    return null;
  } catch (err) {
    console.error(`[Scanner] Failed to extract artwork from ${filePath}:`, err);
    return null;
  }
}

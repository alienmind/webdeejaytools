import fs from 'fs';
import path from 'path';
import { TrackItem } from '../../../shared/types.js';
import { isTaggableExtension, writeTrackTags } from '../tagging/index.js';

export interface TaggingOptions {
  embedArtwork?: boolean;
}

export async function fetchArtworkBuffer(coverUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(coverUrl);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (err) {
    console.warn(`[Tagger] Failed to fetch cover artwork from ${coverUrl}:`, err);
    return null;
  }
}

function artworkMimeType(buffer: Buffer): string {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return 'image/png';
  }
  return 'image/jpeg';
}

/**
 * Tags a freshly downloaded file.
 *
 * Dispatches by container (ID3 for MP3/WAV/AIFF, Vorbis comments for FLAC) and routes through the
 * two-phase verified writer, so a rejected write leaves the downloaded audio intact rather than
 * half-tagged. Returns false on failure - the previous implementation returned true from its own
 * catch block, which reported success for FLAC writes that never happened.
 */
export async function tagAudioFile(
  filePath: string,
  track: TrackItem,
  options: TaggingOptions = { embedArtwork: true }
): Promise<boolean> {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!isTaggableExtension(ext)) {
    console.warn(`[Tagger] No tag writer for ${ext}; leaving ${path.basename(filePath)} untagged.`);
    return false;
  }

  let picture: { mimeType: string; data: Buffer } | null = null;
  if (options.embedArtwork && track.coverUrl) {
    const imageBuffer = await fetchArtworkBuffer(track.coverUrl);
    if (imageBuffer) {
      picture = { mimeType: artworkMimeType(imageBuffer), data: imageBuffer };
    }
  }

  const result = await writeTrackTags(filePath, {
    title: track.title,
    artist: track.artist,
    album: track.album,
    year: track.year || undefined,
    trackNumber: track.trackNumber,
    comment: 'Downloaded with WebDeeJayTools',
    picture,
  });

  if (!result.success) {
    console.error(`[Tagger] Tagging rejected for ${path.basename(filePath)}: ${result.error}`);
  }

  return result.success;
}

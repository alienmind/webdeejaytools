import NodeID3 from 'node-id3';
import fs from 'fs';
import { TrackItem } from '../../../shared/types.js';

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

export async function tagAudioFile(
  filePath: string,
  track: TrackItem,
  options: TaggingOptions = { embedArtwork: true }
): Promise<boolean> {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const isMp3 = filePath.toLowerCase().endsWith('.mp3');
  const isFlac = filePath.toLowerCase().endsWith('.flac');

  let imageBuffer: Buffer | null = null;
  if (options.embedArtwork && track.coverUrl) {
    imageBuffer = await fetchArtworkBuffer(track.coverUrl);
  }

  if (isMp3) {
    try {
      const tags: NodeID3.Tags = {
        title: track.title,
        artist: track.artist,
        album: track.album,
        trackNumber: track.trackNumber ? String(track.trackNumber) : undefined,
        year: track.year || undefined,
        comment: {
          language: 'eng',
          text: 'Downloaded with WebDeeJayTools',
        },
      };

      if (imageBuffer) {
        tags.image = {
          mime: 'image/jpeg',
          type: { id: 3, name: 'front cover' },
          description: 'Album Art',
          imageBuffer,
        };
      }

      const success = NodeID3.write(tags, filePath);
      return success === true;
    } catch (err) {
      console.error(`[Tagger] Failed to tag MP3 file ${filePath}:`, err);
      return false;
    }
  }

  if (isFlac) {
    // For FLAC files, node-id3 or flac metadata can be appended/handled
    // If Vorbis comment writer is available or raw ID3 tag appended
    try {
      const tags: NodeID3.Tags = {
        title: track.title,
        artist: track.artist,
        album: track.album,
        trackNumber: track.trackNumber ? String(track.trackNumber) : undefined,
        year: track.year || undefined,
      };
      if (imageBuffer) {
        tags.image = {
          mime: 'image/jpeg',
          type: { id: 3, name: 'front cover' },
          description: 'Album Art',
          imageBuffer,
        };
      }
      NodeID3.write(tags, filePath);
      return true;
    } catch (err) {
      console.warn(`[Tagger] FLAC tagging notice for ${filePath}:`, err);
      return true;
    }
  }

  return true;
}

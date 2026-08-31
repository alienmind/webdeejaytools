import fs from 'fs';
import path from 'path';
import NodeID3 from 'node-id3';
import * as musicMetadata from 'music-metadata';
import { applyFlacTags, FlacPicture, readFlacComments } from './flac.js';
import { safeReplaceFile, SafeWriteResult } from './safeWrite.js';

export * from './flac.js';
export * from './safeWrite.js';

/**
 * Container-aware tag writer.
 *
 * Every write goes through safeReplaceFile, so the original file is only ever replaced by a
 * candidate that has been re-parsed and had its tags read back.
 */

/** Containers where we can write tags and prove afterwards that we did. */
const ID3_CONTAINERS = new Set(['.mp3', '.wav', '.aiff', '.aif']);
const VORBIS_CONTAINERS = new Set(['.flac']);

export interface TrackTagInput {
  title?: string;
  artist?: string;
  album?: string;
  year?: string | number;
  trackNumber?: number | string;
  bpm?: number | string;
  /** Camelot code or musical key, written to TKEY / INITIALKEY. */
  initialKey?: string;
  comment?: string;
  picture?: { mimeType: string; data: Buffer } | null;
}

export type TagWriteOutcome = SafeWriteResult & {
  /** False when the container has no supported tag writer, e.g. .m4a or .opus. */
  supported: boolean;
};

export function isTaggableExtension(ext: string): boolean {
  const lower = ext.toLowerCase();
  return ID3_CONTAINERS.has(lower) || VORBIS_CONTAINERS.has(lower);
}

function normalizeKeyForComparison(value: string | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

/**
 * Reads BPM and key back out of a parsed file, checking both the common view and the raw native
 * frames. music-metadata surfaces ID3 TBPM and Vorbis BPM differently, and neither always lands in
 * `common`.
 */
function readBackBpmAndKey(metadata: musicMetadata.IAudioMetadata): { bpm?: string; key?: string } {
  let bpm: string | undefined;
  let key: string | undefined;

  if (typeof metadata.common.bpm === 'number' && !Number.isNaN(metadata.common.bpm)) {
    bpm = String(Math.round(metadata.common.bpm));
  }
  if ((metadata.common as any).key) {
    key = String((metadata.common as any).key);
  }

  for (const tagType of Object.keys(metadata.native || {})) {
    for (const tag of metadata.native[tagType]) {
      const id = tag.id.toUpperCase();
      const raw = typeof tag.value === 'string' ? tag.value : tag.value != null ? String(tag.value) : '';
      if (!bpm && (id === 'TBPM' || id === 'BPM')) bpm = raw;
      if (!key && (id === 'TKEY' || id === 'INITIALKEY' || id === 'KEY')) key = raw;
    }
  }

  return { bpm: bpm?.trim(), key: key?.trim() };
}

function applyId3(workPath: string, tags: TrackTagInput): void {
  const id3: NodeID3.Tags = {
    title: tags.title,
    artist: tags.artist,
    album: tags.album,
    year: tags.year !== undefined ? String(tags.year) : undefined,
    trackNumber: tags.trackNumber !== undefined ? String(tags.trackNumber) : undefined,
    bpm: tags.bpm !== undefined ? String(tags.bpm) : undefined,
    initialKey: tags.initialKey,
  };

  if (tags.comment) {
    id3.comment = { language: 'eng', text: tags.comment };
  }

  if (tags.picture) {
    id3.image = {
      mime: tags.picture.mimeType,
      type: { id: 3, name: 'front cover' },
      description: 'Album Art',
      imageBuffer: tags.picture.data,
    };
  }

  // Strip undefined so node-id3 does not clear frames the caller never mentioned.
  for (const key of Object.keys(id3) as (keyof NodeID3.Tags)[]) {
    if (id3[key] === undefined) delete id3[key];
  }

  const result = NodeID3.update(id3, workPath);
  if (result !== true) {
    throw new Error(typeof result === 'object' ? String(result) : 'node-id3 rejected the tag write');
  }
}

async function applyVorbis(workPath: string, tags: TrackTagInput): Promise<void> {
  const picture: FlacPicture | null | undefined = tags.picture
    ? { mimeType: tags.picture.mimeType, data: tags.picture.data, pictureType: 3 }
    : undefined;

  const buffer = await fs.promises.readFile(workPath);
  const tagged = applyFlacTags(buffer, {
    comments: {
      TITLE: tags.title,
      ARTIST: tags.artist,
      ALBUM: tags.album,
      DATE: tags.year !== undefined ? String(tags.year) : undefined,
      TRACKNUMBER: tags.trackNumber !== undefined ? String(tags.trackNumber) : undefined,
      BPM: tags.bpm !== undefined ? String(tags.bpm) : undefined,
      INITIALKEY: tags.initialKey,
      COMMENT: tags.comment,
    },
    picture,
  });

  await fs.promises.writeFile(workPath, tagged);
}

/**
 * Writes tags to an audio file via the two-phase verified path.
 *
 * Unsupported containers return `{ supported: false, success: false }` rather than silently
 * reporting success - the previous behaviour of returning true for a write that did nothing is
 * what let bogus tags look like real ones.
 */
export async function writeTrackTags(
  filePath: string,
  tags: TrackTagInput,
  options: { keepBackup?: boolean } = {}
): Promise<TagWriteOutcome> {
  const resolved = path.resolve(filePath);
  const ext = path.extname(resolved).toLowerCase();

  if (!isTaggableExtension(ext)) {
    return {
      supported: false,
      success: false,
      verified: false,
      filePath: resolved,
      error: `No tag writer for ${ext || 'this container'}. Supported: ${[...ID3_CONTAINERS, ...VORBIS_CONTAINERS].join(', ')}`,
    };
  }

  const isFlac = VORBIS_CONTAINERS.has(ext);

  const result = await safeReplaceFile(
    resolved,
    async (workPath) => {
      if (isFlac) {
        await applyVorbis(workPath, tags);
      } else {
        applyId3(workPath, tags);
      }
    },
    {
      keepBackup: options.keepBackup,
      verifyTags: async (metadata) => {
        // Prove the values are actually readable from the rewritten file. This is the check that
        // catches a tag library reporting success while writing nothing.
        const readBack = readBackBpmAndKey(metadata);

        if (tags.bpm !== undefined) {
          const expected = String(tags.bpm).trim();
          if (!readBack.bpm || Math.round(parseFloat(readBack.bpm)) !== Math.round(parseFloat(expected))) {
            throw new Error(`BPM did not persist (expected ${expected}, read back ${readBack.bpm ?? 'nothing'})`);
          }
        }

        if (tags.initialKey !== undefined) {
          const expected = normalizeKeyForComparison(tags.initialKey);
          if (normalizeKeyForComparison(readBack.key) !== expected) {
            throw new Error(`Key did not persist (expected ${expected}, read back ${readBack.key ?? 'nothing'})`);
          }
        }

        if (tags.title !== undefined && metadata.common.title?.trim() !== tags.title.trim()) {
          throw new Error('Title did not persist');
        }

        if (tags.artist !== undefined) {
          const artist = metadata.common.artist?.trim() || metadata.common.artists?.[0]?.trim();
          if (artist !== tags.artist.trim()) {
            throw new Error('Artist did not persist');
          }
        }
      },
    }
  );

  return { ...result, supported: true };
}

/** Convenience wrapper for the analyzer: writes only BPM and key. */
export async function writeAnalysisTags(
  filePath: string,
  bpm: number,
  camelotKey: string
): Promise<TagWriteOutcome> {
  return writeTrackTags(filePath, { bpm, initialKey: camelotKey });
}

/** Reads the BPM/key pair currently on disk. Used by tests and by the UI's verify action. */
export async function readTrackTags(filePath: string): Promise<{ bpm?: string; key?: string }> {
  const ext = path.extname(filePath).toLowerCase();
  if (VORBIS_CONTAINERS.has(ext)) {
    const comments = readFlacComments(await fs.promises.readFile(filePath));
    return { bpm: comments.BPM, key: comments.INITIALKEY || comments.KEY };
  }
  const metadata = await musicMetadata.parseFile(filePath, { duration: false });
  return readBackBpmAndKey(metadata);
}

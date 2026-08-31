import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  applyFlacTags,
  getLeadingId3Length,
  isFlacBuffer,
  readFlacComments,
} from '../../src/server/services/tagging/flac.js';
import { safeReplaceFile } from '../../src/server/services/tagging/safeWrite.js';

/**
 * Builds a minimal but structurally valid FLAC stream: magic, a STREAMINFO block, an optional
 * VORBIS_COMMENT block, then some bytes standing in for audio frames.
 */
function buildFlac(options: { comments?: string[]; withId3?: boolean } = {}): Buffer {
  const parts: Buffer[] = [];

  if (options.withId3) {
    // ID3v2 header with a 16-byte synchsafe payload, of the kind node-id3 used to prepend.
    const id3 = Buffer.alloc(10 + 16);
    id3.write('ID3', 0, 'ascii');
    id3[3] = 4;
    id3[9] = 16;
    parts.push(id3);
  }

  parts.push(Buffer.from('fLaC', 'ascii'));

  const streamInfo = Buffer.alloc(34);
  const streamInfoHeader = Buffer.alloc(4);
  const hasComments = Boolean(options.comments);
  streamInfoHeader.writeUInt32BE(((((hasComments ? 0 : 0x80) << 24) | (0 << 24) | streamInfo.length) >>> 0), 0);
  parts.push(streamInfoHeader, streamInfo);

  if (options.comments) {
    const vendor = Buffer.from('reference libFLAC', 'utf8');
    const entries = options.comments.map((entry) => {
      const value = Buffer.from(entry, 'utf8');
      const len = Buffer.alloc(4);
      len.writeUInt32LE(value.length, 0);
      return Buffer.concat([len, value]);
    });
    const vendorLen = Buffer.alloc(4);
    vendorLen.writeUInt32LE(vendor.length, 0);
    const count = Buffer.alloc(4);
    count.writeUInt32LE(entries.length, 0);
    const payload = Buffer.concat([vendorLen, vendor, count, ...entries]);

    const header = Buffer.alloc(4);
    header.writeUInt32BE((((0x80 << 24) | (4 << 24) | payload.length) >>> 0), 0);
    parts.push(header, payload);
  }

  parts.push(Buffer.from('AUDIOFRAMESAUDIOFRAMES', 'ascii'));
  return Buffer.concat(parts);
}

describe('FLAC Vorbis comment writer', () => {
  it('recognises a FLAC stream', () => {
    expect(isFlacBuffer(buildFlac())).toBe(true);
    expect(isFlacBuffer(Buffer.from('ID3not a flac at all'))).toBe(false);
  });

  it('writes BPM and INITIALKEY as readable Vorbis comments', () => {
    const tagged = applyFlacTags(buildFlac(), {
      comments: { BPM: 128, INITIALKEY: '8A', TITLE: 'Test Track' },
    });

    const comments = readFlacComments(tagged);
    expect(comments.BPM).toBe('128');
    expect(comments.INITIALKEY).toBe('8A');
    expect(comments.TITLE).toBe('Test Track');
  });

  it('preserves the audio frames byte for byte', () => {
    const original = buildFlac();
    const tagged = applyFlacTags(original, { comments: { BPM: 174 } });

    const audio = Buffer.from('AUDIOFRAMESAUDIOFRAMES', 'ascii');
    expect(tagged.subarray(tagged.length - audio.length)).toEqual(audio);
  });

  it('merges over existing comments rather than discarding them', () => {
    const withExisting = buildFlac({ comments: ['ARTIST=Daft Punk', 'ALBUM=Discovery'] });
    const tagged = applyFlacTags(withExisting, { comments: { BPM: 123 } });

    const comments = readFlacComments(tagged);
    expect(comments.ARTIST).toBe('Daft Punk');
    expect(comments.ALBUM).toBe('Discovery');
    expect(comments.BPM).toBe('123');
  });

  it('replaces the whole comment list when asked to', () => {
    const withExisting = buildFlac({ comments: ['ARTIST=Old', 'ALBUM=Old'] });
    const tagged = applyFlacTags(withExisting, { comments: { BPM: 100 }, replaceAll: true });

    const comments = readFlacComments(tagged);
    expect(comments.ARTIST).toBeUndefined();
    expect(comments.BPM).toBe('100');
  });

  it('strips a leading ID3v2 blob, repairing files damaged by the old ID3-on-FLAC path', () => {
    const damaged = buildFlac({ withId3: true });
    expect(getLeadingId3Length(damaged)).toBe(26);

    const repaired = applyFlacTags(damaged, { comments: { BPM: 128 } });

    expect(getLeadingId3Length(repaired)).toBe(0);
    expect(repaired.subarray(0, 4).toString('ascii')).toBe('fLaC');
    expect(readFlacComments(repaired).BPM).toBe('128');
  });

  it('refuses a buffer that is not a FLAC stream', () => {
    expect(() => applyFlacTags(Buffer.from('definitely not flac'), { comments: {} })).toThrow();
  });
});

describe('two-phase verified tag write', () => {
  const base = path.resolve(process.cwd(), 'data', 'test_tagging');
  const target = path.join(base, 'track.bin');
  const originalContent = 'ORIGINAL CONTENT THAT MUST SURVIVE';

  beforeEach(async () => {
    await fs.promises.mkdir(base, { recursive: true });
    await fs.promises.writeFile(target, originalContent);
  });

  afterEach(async () => {
    if (fs.existsSync(base)) {
      await fs.promises.rm(base, { recursive: true, force: true });
    }
  });

  it('leaves the original untouched when the mutation throws', async () => {
    const result = await safeReplaceFile(target, async () => {
      throw new Error('tag library exploded');
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('tag library exploded');
    expect(await fs.promises.readFile(target, 'utf-8')).toBe(originalContent);
  });

  it('leaves the original untouched when tag verification rejects the candidate', async () => {
    const flacTarget = path.join(base, 'track.flac');
    const originalBytes = buildFlac();
    await fs.promises.writeFile(flacTarget, originalBytes);

    const result = await safeReplaceFile(
      flacTarget,
      async (workPath) => {
        const tagged = applyFlacTags(await fs.promises.readFile(workPath), {
          comments: { BPM: 128 },
        });
        await fs.promises.writeFile(workPath, tagged);
      },
      {
        verifyTags: () => {
          throw new Error('BPM did not persist');
        },
      }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('BPM did not persist');
    expect(await fs.promises.readFile(flacTarget)).toEqual(originalBytes);
  });

  it('refuses to claim success when the candidate cannot be parsed to verify its tags', async () => {
    const result = await safeReplaceFile(
      target,
      async (workPath) => {
        await fs.promises.writeFile(workPath, 'NOT AUDIO AT ALL');
      },
      { verifyTags: () => undefined }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('could not be parsed');
    expect(await fs.promises.readFile(target, 'utf-8')).toBe(originalContent);
  });

  it('leaves the original untouched when the mutation empties the file', async () => {
    const result = await safeReplaceFile(target, async (workPath) => {
      await fs.promises.writeFile(workPath, '');
    });

    expect(result.success).toBe(false);
    expect(await fs.promises.readFile(target, 'utf-8')).toBe(originalContent);
  });

  it('never opens the original for writing - the mutation only sees a copy', async () => {
    let seenPath = '';
    await safeReplaceFile(target, async (workPath) => {
      seenPath = workPath;
      await fs.promises.writeFile(workPath, 'NEW CONTENT');
    });

    expect(seenPath).not.toBe(target);
    expect(seenPath).toContain('.wdt-work');
  });

  it('swaps the file in and cleans up its work and backup files on success', async () => {
    const result = await safeReplaceFile(target, async (workPath) => {
      await fs.promises.writeFile(workPath, 'NEW CONTENT');
    });

    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);
    expect(await fs.promises.readFile(target, 'utf-8')).toBe('NEW CONTENT');

    const leftovers = (await fs.promises.readdir(base)).filter(
      (f) => f.includes('.wdt-work') || f.includes('.wdt-bak')
    );
    expect(leftovers).toEqual([]);
  });

  it('reports a missing file rather than creating one', async () => {
    const result = await safeReplaceFile(path.join(base, 'nope.bin'), async () => undefined);
    expect(result.success).toBe(false);
    expect(result.error).toBe('File does not exist');
  });
});

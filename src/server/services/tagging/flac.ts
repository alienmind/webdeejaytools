import fs from 'fs';

/**
 * Minimal FLAC metadata writer - Vorbis comments and embedded picture.
 *
 * Reason this exists: node-id3 writes an ID3v2 container, which for FLAC means a blob prepended
 * before the `fLaC` magic. That is out of spec, strict decoders and some CDJ firmware reject it,
 * and Rekordbox/Serato read BPM and INITIALKEY from Vorbis comments only - so ID3-on-FLAC tags are
 * invisible to exactly the software this tool exists to feed.
 *
 * Format notes that matter here (see the FLAC format spec):
 * - Stream is "fLaC" then a chain of metadata blocks.
 * - Block header: 1 bit last-block flag, 7 bits type, 24 bits big-endian length.
 * - Types used: 0 STREAMINFO (must stay first), 1 PADDING, 4 VORBIS_COMMENT, 6 PICTURE.
 * - Trap: VORBIS_COMMENT payload is LITTLE-endian, unlike every other length in the container.
 */

const FLAC_MAGIC = Buffer.from('fLaC', 'ascii');

const BLOCK_STREAMINFO = 0;
const BLOCK_PADDING = 1;
const BLOCK_VORBIS_COMMENT = 4;
const BLOCK_PICTURE = 6;

const DEFAULT_VENDOR = 'webdeejaytools';

interface MetadataBlock {
  type: number;
  data: Buffer;
}

export interface FlacPicture {
  mimeType: string;
  data: Buffer;
  description?: string;
  /** ID3v2 APIC picture type; 3 = front cover. */
  pictureType?: number;
}

export interface FlacTagInput {
  /** Vorbis comment fields, e.g. { TITLE: 'x', BPM: '128', INITIALKEY: '8A' }. */
  comments: Record<string, string | number | undefined>;
  picture?: FlacPicture | null;
  /** Replace the whole comment list instead of merging over what is already there. */
  replaceAll?: boolean;
}

/**
 * Length of a leading ID3v2 tag, or 0 when there is none.
 *
 * Files tagged by earlier versions of this app have one. It is illegal in FLAC, so we detect it and
 * drop it while rewriting - which repairs those files rather than compounding the damage.
 */
export function getLeadingId3Length(buffer: Buffer): number {
  if (buffer.length < 10) return 0;
  if (buffer.toString('ascii', 0, 3) !== 'ID3') return 0;

  const flags = buffer[5];
  // Synchsafe integer: 7 significant bits per byte.
  const size =
    ((buffer[6] & 0x7f) << 21) |
    ((buffer[7] & 0x7f) << 14) |
    ((buffer[8] & 0x7f) << 7) |
    (buffer[9] & 0x7f);

  const hasFooter = (flags & 0x10) !== 0;
  return 10 + size + (hasFooter ? 10 : 0);
}

export function isFlacBuffer(buffer: Buffer): boolean {
  const offset = getLeadingId3Length(buffer);
  return buffer.length > offset + 4 && buffer.subarray(offset, offset + 4).equals(FLAC_MAGIC);
}

function parseVorbisComment(data: Buffer): { vendor: string; comments: string[] } {
  let offset = 0;
  if (data.length < 4) return { vendor: DEFAULT_VENDOR, comments: [] };

  const vendorLength = data.readUInt32LE(offset);
  offset += 4;
  if (vendorLength > data.length - offset) return { vendor: DEFAULT_VENDOR, comments: [] };

  const vendor = data.toString('utf8', offset, offset + vendorLength);
  offset += vendorLength;

  if (offset + 4 > data.length) return { vendor, comments: [] };
  const count = data.readUInt32LE(offset);
  offset += 4;

  const comments: string[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 4 > data.length) break;
    const len = data.readUInt32LE(offset);
    offset += 4;
    if (len > data.length - offset) break;
    comments.push(data.toString('utf8', offset, offset + len));
    offset += len;
  }

  return { vendor, comments };
}

function buildVorbisComment(vendor: string, comments: string[]): Buffer {
  const vendorBuf = Buffer.from(vendor, 'utf8');
  const entryBufs = comments.map((entry) => {
    const value = Buffer.from(entry, 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(value.length, 0);
    return Buffer.concat([header, value]);
  });

  const head = Buffer.alloc(8);
  head.writeUInt32LE(vendorBuf.length, 0);
  const countBuf = Buffer.alloc(4);
  countBuf.writeUInt32LE(entryBufs.length, 0);

  return Buffer.concat([
    head.subarray(0, 4),
    vendorBuf,
    countBuf,
    ...entryBufs,
  ]);
}

function buildPictureBlock(picture: FlacPicture): Buffer {
  const mime = Buffer.from(picture.mimeType || 'image/jpeg', 'ascii');
  const description = Buffer.from(picture.description || '', 'utf8');

  const head = Buffer.alloc(8 + mime.length + 4 + description.length + 20);
  let offset = 0;

  head.writeUInt32BE(picture.pictureType ?? 3, offset);
  offset += 4;
  head.writeUInt32BE(mime.length, offset);
  offset += 4;
  mime.copy(head, offset);
  offset += mime.length;
  head.writeUInt32BE(description.length, offset);
  offset += 4;
  description.copy(head, offset);
  offset += description.length;

  // Width, height, colour depth, indexed colours. Zero is legal and means "unspecified"; decoding
  // the image to fill these in would mean a native image dependency, which the project forbids.
  head.writeUInt32BE(0, offset);
  offset += 4;
  head.writeUInt32BE(0, offset);
  offset += 4;
  head.writeUInt32BE(0, offset);
  offset += 4;
  head.writeUInt32BE(0, offset);
  offset += 4;
  head.writeUInt32BE(picture.data.length, offset);
  offset += 4;

  return Buffer.concat([head.subarray(0, offset), picture.data]);
}

function readBlocks(buffer: Buffer, startOffset: number): { blocks: MetadataBlock[]; audioOffset: number } {
  const blocks: MetadataBlock[] = [];
  let offset = startOffset + 4; // past "fLaC"

  for (;;) {
    if (offset + 4 > buffer.length) {
      throw new Error('Truncated FLAC metadata block header');
    }
    const header = buffer.readUInt32BE(offset);
    const isLast = (header & 0x80000000) !== 0;
    const type = (header >>> 24) & 0x7f;
    const length = header & 0x00ffffff;
    offset += 4;

    if (offset + length > buffer.length) {
      throw new Error('Truncated FLAC metadata block payload');
    }

    blocks.push({ type, data: buffer.subarray(offset, offset + length) });
    offset += length;

    if (isLast) break;
  }

  return { blocks, audioOffset: offset };
}

function serializeBlocks(blocks: MetadataBlock[]): Buffer {
  const out: Buffer[] = [];
  blocks.forEach((block, index) => {
    const isLast = index === blocks.length - 1;
    if (block.data.length > 0x00ffffff) {
      throw new Error(`FLAC metadata block type ${block.type} exceeds the 16 MiB block limit`);
    }
    const header = Buffer.alloc(4);
    // >>> 0 is required: the last-block flag is bit 31, and JS bitwise operators produce a signed
    // 32-bit result, so the expression is negative without the unsigned coercion.
    const packed = (((isLast ? 0x80 : 0) << 24) | (block.type << 24) | block.data.length) >>> 0;
    header.writeUInt32BE(packed, 0);
    out.push(header, block.data);
  });
  return Buffer.concat(out);
}

/** Parses the Vorbis comments already present in a FLAC buffer. */
export function readFlacComments(buffer: Buffer): Record<string, string> {
  const id3Length = getLeadingId3Length(buffer);
  if (!isFlacBuffer(buffer)) return {};

  const { blocks } = readBlocks(buffer, id3Length);
  const commentBlock = blocks.find((b) => b.type === BLOCK_VORBIS_COMMENT);
  if (!commentBlock) return {};

  const { comments } = parseVorbisComment(commentBlock.data);
  const result: Record<string, string> = {};
  for (const entry of comments) {
    const eq = entry.indexOf('=');
    if (eq <= 0) continue;
    result[entry.slice(0, eq).toUpperCase()] = entry.slice(eq + 1);
  }
  return result;
}

/**
 * Returns a new FLAC buffer with the given Vorbis comments (and optional picture) applied.
 *
 * Any leading ID3v2 blob is dropped, since it is invalid in this container.
 */
export function applyFlacTags(buffer: Buffer, input: FlacTagInput): Buffer {
  const id3Length = getLeadingId3Length(buffer);
  if (!isFlacBuffer(buffer)) {
    throw new Error('Not a FLAC stream');
  }

  const { blocks, audioOffset } = readBlocks(buffer, id3Length);
  const audio = buffer.subarray(audioOffset);

  const existing = blocks.find((b) => b.type === BLOCK_VORBIS_COMMENT);
  const parsed = existing
    ? parseVorbisComment(existing.data)
    : { vendor: DEFAULT_VENDOR, comments: [] as string[] };

  const merged = new Map<string, string>();
  if (!input.replaceAll) {
    for (const entry of parsed.comments) {
      const eq = entry.indexOf('=');
      if (eq <= 0) continue;
      merged.set(entry.slice(0, eq).toUpperCase(), entry.slice(eq + 1));
    }
  }

  for (const [rawKey, rawValue] of Object.entries(input.comments)) {
    const key = rawKey.toUpperCase();
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      merged.delete(key);
    } else {
      merged.set(key, String(rawValue));
    }
  }

  const commentEntries = Array.from(merged.entries()).map(([k, v]) => `${k}=${v}`);
  const newCommentBlock: MetadataBlock = {
    type: BLOCK_VORBIS_COMMENT,
    data: buildVorbisComment(parsed.vendor || DEFAULT_VENDOR, commentEntries),
  };

  // STREAMINFO must remain the first block. Padding is dropped: it exists to allow in-place tag
  // edits, and we rewrite the whole file anyway.
  const streamInfo = blocks.filter((b) => b.type === BLOCK_STREAMINFO);
  const others = blocks.filter(
    (b) =>
      b.type !== BLOCK_STREAMINFO &&
      b.type !== BLOCK_VORBIS_COMMENT &&
      b.type !== BLOCK_PADDING &&
      !(input.picture !== undefined && b.type === BLOCK_PICTURE)
  );

  const rebuilt: MetadataBlock[] = [...streamInfo, newCommentBlock, ...others];

  if (input.picture) {
    rebuilt.push({ type: BLOCK_PICTURE, data: buildPictureBlock(input.picture) });
  }

  return Buffer.concat([FLAC_MAGIC, serializeBlocks(rebuilt), audio]);
}

/** Reads a FLAC file, applies tags, and returns the new bytes. Does not write to disk. */
export async function buildTaggedFlac(filePath: string, input: FlacTagInput): Promise<Buffer> {
  const buffer = await fs.promises.readFile(filePath);
  return applyFlacTags(buffer, input);
}

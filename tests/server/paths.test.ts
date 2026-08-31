import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  PathNotAllowedError,
  assertAllowedPath,
  clearSessionRoots,
  grantSessionRoot,
  isInsideRoot,
  isPathAllowed,
} from '../../src/server/util/paths.js';

describe('filesystem containment guard', () => {
  const base = path.resolve(process.cwd(), 'data', 'test_paths');
  const allowed = path.join(base, 'library');
  const outside = path.join(base, 'private');

  beforeEach(async () => {
    await fs.promises.mkdir(allowed, { recursive: true });
    await fs.promises.mkdir(outside, { recursive: true });
    clearSessionRoots();
    grantSessionRoot(allowed);
  });

  afterEach(async () => {
    clearSessionRoots();
    if (fs.existsSync(base)) {
      await fs.promises.rm(base, { recursive: true, force: true });
    }
  });

  it('accepts the root itself and paths under it', () => {
    expect(isPathAllowed(allowed)).toBe(true);
    expect(isPathAllowed(path.join(allowed, 'track.flac'))).toBe(true);
    expect(isPathAllowed(path.join(allowed, 'Artist - Album', '01.mp3'))).toBe(true);
  });

  it('rejects paths outside every root', () => {
    expect(isPathAllowed(path.join(outside, 'secret.txt'))).toBe(false);
    expect(() => assertAllowedPath(path.join(outside, 'secret.txt'))).toThrow(PathNotAllowedError);
  });

  it('rejects traversal that climbs back out of a root', () => {
    const traversal = path.join(allowed, '..', 'private', 'secret.txt');
    expect(isPathAllowed(traversal)).toBe(false);
    expect(() => assertAllowedPath(traversal)).toThrow(PathNotAllowedError);
  });

  it('does not treat a sibling with the root as a name prefix as being inside it', () => {
    // The reason isInsideRoot uses path.relative rather than a startsWith check.
    expect(isInsideRoot(`${allowed}-evil/track.mp3`, allowed)).toBe(false);
    expect(isInsideRoot(`${allowed}evil`, allowed)).toBe(false);
  });

  it('rejects absolute paths to system locations', () => {
    const systemPath = process.platform === 'win32' ? 'C:\\Windows\\System32\\config\\SAM' : '/etc/shadow';
    expect(isPathAllowed(systemPath)).toBe(false);
    expect(() => assertAllowedPath(systemPath)).toThrow(PathNotAllowedError);
  });

  it('rejects an empty or missing path', () => {
    expect(isPathAllowed('')).toBe(false);
    expect(() => assertAllowedPath('')).toThrow(PathNotAllowedError);
  });

  it('allows a path that does not exist yet, as long as it is lexically contained', () => {
    const notYet = path.join(allowed, 'New Set', 'track.flac');
    expect(() => assertAllowedPath(notYet)).not.toThrow();
  });
});

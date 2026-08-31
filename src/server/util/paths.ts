import fs from 'fs';
import os from 'os';
import path from 'path';
import { store } from '../db/store.js';

/**
 * Filesystem containment guard.
 *
 * The embedded server is reachable by any page loaded in any browser on the machine, so every
 * caller-supplied path must be proven to sit inside a root the user actually opted into. Without
 * this, `GET /api/mp3/stream?path=<anything>` is an arbitrary file read and `POST /api/mp3/delete`
 * is an arbitrary unlink.
 */

export class PathNotAllowedError extends Error {
  public readonly status = 403;
  constructor(candidate: string) {
    super(`Path is outside the allowed library/download roots: ${candidate}`);
    this.name = 'PathNotAllowedError';
  }
}

/**
 * Roots the user explicitly picked during this run (native folder dialog, or an explicit scan of a
 * directory that was itself already allowed). Session-scoped on purpose: it dies with the process
 * rather than persisting an ever-growing grant list into db.json.
 */
const sessionRoots = new Set<string>();

export function grantSessionRoot(dir: string): void {
  if (!dir) return;
  sessionRoots.add(path.resolve(dir));
}

export function clearSessionRoots(): void {
  sessionRoots.clear();
}

/**
 * Windows and macOS default to case-insensitive volumes; Linux does not. Folding case on Linux
 * would make `Track.flac` and `track.flac` collide, so it is conditional on platform.
 */
const CASE_INSENSITIVE_FS = process.platform === 'win32' || process.platform === 'darwin';

function foldCase(p: string): string {
  return CASE_INSENSITIVE_FS ? p.toLowerCase() : p;
}

export function samePath(a: string, b: string): boolean {
  return foldCase(path.resolve(a)) === foldCase(path.resolve(b));
}

export function getAllowedRoots(): string[] {
  const settings = store.getSettings();
  const roots = [
    settings.defaultLibraryDir,
    settings.defaultDownloadDir,
    ...sessionRoots,
  ].filter((r): r is string => Boolean(r && r.trim()));

  return Array.from(new Set(roots.map((r) => path.resolve(r))));
}

/**
 * True when `candidate` is `root` itself or lives underneath it.
 *
 * Uses path.relative rather than a prefix string compare, so `C:\library-evil` is not mistaken for
 * a child of `C:\library`.
 */
export function isInsideRoot(candidate: string, root: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);

  if (foldCase(resolvedCandidate) === foldCase(resolvedRoot)) return true;

  const rel = path.relative(resolvedRoot, resolvedCandidate);
  if (!rel) return true;
  if (path.isAbsolute(rel)) return false;

  const parts = rel.split(/[\\/]/);
  return parts[0] !== '..';
}

export function isPathAllowed(candidate: string, roots: string[] = getAllowedRoots()): boolean {
  if (!candidate || !candidate.trim()) return false;
  return roots.some((root) => isInsideRoot(candidate, root));
}

/**
 * Resolves a caller-supplied path and throws unless it is contained by an allowed root.
 *
 * Symlinks are resolved when the target exists so a link planted inside the library cannot be used
 * to escape it; the pre-resolution path is checked too, so a link is only usable when both ends
 * are legitimate.
 */
export function assertAllowedPath(candidate: string, roots: string[] = getAllowedRoots()): string {
  const resolved = path.resolve(candidate ?? '');

  if (!isPathAllowed(resolved, roots)) {
    throw new PathNotAllowedError(candidate);
  }

  try {
    const real = fs.realpathSync.native(resolved);
    if (!isPathAllowed(real, roots)) {
      throw new PathNotAllowedError(candidate);
    }
    return real;
  } catch (err) {
    if (err instanceof PathNotAllowedError) throw err;
    // Path does not exist yet (a create-dj-set destination, for example). The lexical check above
    // already passed, which is the guarantee we can make for a path with no inode.
    return resolved;
  }
}

export function assertAllowedPaths(candidates: string[], roots: string[] = getAllowedRoots()): string[] {
  return candidates.map((candidate) => assertAllowedPath(candidate, roots));
}

/**
 * A directory the user is asking to open for the first time. Allowed when already contained by a
 * known root; otherwise it becomes a new session root, because reaching this call means the user
 * typed or picked it deliberately in the UI.
 */
export function grantAndAssertDirectory(dir: string): string {
  const resolved = path.resolve(dir);
  if (!isPathAllowed(resolved)) {
    grantSessionRoot(resolved);
  }
  return assertAllowedPath(resolved);
}

/** True when the path sits in the OS temp tree - used to reject stale portable-run settings. */
export function isTempPath(candidate: string): boolean {
  if (!candidate) return false;
  return isInsideRoot(candidate, os.tmpdir());
}

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as musicMetadata from 'music-metadata';

/**
 * Two-phase verified tag write.
 *
 * Tagging mutates files the user often cannot re-acquire (paid lossless downloads, ripped vinyl).
 * A tagging library that half-writes a file, or writes a structurally invalid one, destroys the
 * only copy. So nothing ever mutates the original in place:
 *
 *   1. Copy the original to a sibling work file (same directory, therefore same volume, so the
 *      final rename is atomic rather than a cross-device copy).
 *   2. Apply the tag mutation to the work file.
 *   3. Verify the work file independently - re-parse it, confirm the audio stream still decodes to
 *      the same duration, and confirm the tags we intended are actually readable.
 *   4. Only then swap it over the original, keeping a backup until the swap has succeeded.
 *
 * Any failure at any step leaves the original byte-identical.
 */

export interface SafeWriteResult {
  success: boolean;
  filePath: string;
  /** Populated when the write was rejected; the original is untouched in that case. */
  error?: string;
  verified: boolean;
}

export interface SafeWriteOptions {
  /**
   * Extra assertion run against the rewritten file before the swap. Throw to reject the write.
   * Receives the parsed metadata of the candidate file.
   */
  verifyTags?: (metadata: musicMetadata.IAudioMetadata) => void | Promise<void>;
  /** Tolerated duration drift between original and rewritten file, in seconds. */
  durationToleranceSec?: number;
  /** Keep the .wdt-bak file after a successful swap. Off by default. */
  keepBackup?: boolean;
}

const WORK_SUFFIX = '.wdt-work';
const BACKUP_SUFFIX = '.wdt-bak';

function tempSibling(filePath: string, suffix: string): string {
  const unique = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  return path.join(path.dirname(filePath), `${path.basename(filePath)}${suffix}-${unique}`);
}

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // Already gone, or locked by a scanner. Not worth failing the operation over.
  }
}

/**
 * Windows holds brief locks on files an antivirus or indexer has just touched, surfacing as EPERM
 * or EBUSY on rename. Retrying with a short backoff clears the overwhelming majority of these.
 */
async function renameWithRetry(from: string, to: string, attempts = 5): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await fs.promises.rename(from, to);
      return;
    } catch (err: any) {
      lastErr = err;
      if (err?.code !== 'EPERM' && err?.code !== 'EBUSY' && err?.code !== 'EACCES') {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 40 * (i + 1)));
    }
  }
  throw lastErr;
}

async function parseQuietly(filePath: string): Promise<musicMetadata.IAudioMetadata | null> {
  try {
    return await musicMetadata.parseFile(filePath, { duration: true });
  } catch {
    return null;
  }
}

/**
 * Runs `mutate` against a throwaway copy of `filePath`, verifies the result, then atomically
 * replaces the original. The original is never opened for writing.
 */
export async function safeReplaceFile(
  filePath: string,
  mutate: (workPath: string) => Promise<void> | void,
  options: SafeWriteOptions = {}
): Promise<SafeWriteResult> {
  const resolved = path.resolve(filePath);
  const tolerance = options.durationToleranceSec ?? 1;

  if (!fs.existsSync(resolved)) {
    return { success: false, filePath: resolved, verified: false, error: 'File does not exist' };
  }

  const originalMeta = await parseQuietly(resolved);
  const originalStat = await fs.promises.stat(resolved);
  const workPath = tempSibling(resolved, WORK_SUFFIX);
  const backupPath = tempSibling(resolved, BACKUP_SUFFIX);

  try {
    // Phase 1: work on a copy, never the original.
    await fs.promises.copyFile(resolved, workPath);
    await mutate(workPath);

    // Phase 2: verify the candidate independently of whatever wrote it.
    const workStat = await fs.promises.stat(workPath);
    if (workStat.size === 0) {
      throw new Error('Rewritten file is empty');
    }

    const workMeta = await parseQuietly(workPath);

    // Only demand of the candidate what the original could already do. A file that never parsed as
    // audio (an unusual container, or a stub) must not be held to a stricter standard than it
    // started with - but a real audio file that stops parsing after tagging is a hard failure.
    if (originalMeta && !workMeta) {
      throw new Error('Rewritten file could not be parsed as audio');
    }

    if (workMeta && originalMeta?.format.container && workMeta.format.container !== originalMeta.format.container) {
      throw new Error(
        `Container changed during tagging: ${originalMeta.format.container} -> ${workMeta.format.container}`
      );
    }

    const originalDuration = originalMeta?.format.duration;
    const workDuration = workMeta?.format.duration;
    if (
      typeof originalDuration === 'number' &&
      typeof workDuration === 'number' &&
      Math.abs(originalDuration - workDuration) > tolerance
    ) {
      throw new Error(
        `Audio duration changed during tagging: ${originalDuration.toFixed(2)}s -> ${workDuration.toFixed(2)}s`
      );
    }

    // If the caller wants tags verified, an unparseable candidate is a failure by definition: we
    // cannot prove the tags landed, so we must not swap the file in and claim we did.
    if (options.verifyTags) {
      if (!workMeta) {
        throw new Error('Rewritten file could not be parsed, so its tags could not be verified');
      }
      await options.verifyTags(workMeta);
    }

    // Phase 3: swap. Move the original aside first so a failed swap can be rolled back, and so the
    // rename does not depend on overwrite-in-place semantics differing across platforms.
    await renameWithRetry(resolved, backupPath);
    try {
      await renameWithRetry(workPath, resolved);
    } catch (swapErr) {
      await renameWithRetry(backupPath, resolved).catch(() => undefined);
      throw swapErr;
    }

    if (options.keepBackup) {
      const keptPath = `${resolved}${BACKUP_SUFFIX}`;
      await renameWithRetry(backupPath, keptPath).catch(() => undefined);
    } else {
      await safeUnlink(backupPath);
    }

    return { success: true, filePath: resolved, verified: true };
  } catch (err: any) {
    await safeUnlink(workPath);

    // If the original was moved aside but never replaced, put it back.
    if (fs.existsSync(backupPath) && !fs.existsSync(resolved)) {
      await renameWithRetry(backupPath, resolved).catch(() => undefined);
    } else {
      await safeUnlink(backupPath);
    }

    // Sanity check that the rollback held.
    const stillThere = fs.existsSync(resolved) && (await fs.promises.stat(resolved)).size === originalStat.size;

    return {
      success: false,
      filePath: resolved,
      verified: false,
      error: stillThere
        ? err?.message || 'Tag write rejected during verification'
        : `Tag write failed AND the original could not be restored: ${err?.message}`,
    };
  }
}

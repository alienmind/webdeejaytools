import fs from 'fs';
import path from 'path';
import sanitize from 'sanitize-filename';
import { CreateDjSetRequest, CreateDjSetResult } from '../../../shared/types.js';
import { store } from '../../db/index.js';

/**
 * Generates a non-conflicting filename if a file with the same name already exists in targetDir.
 */
async function getUniqueDestinationPath(targetDir: string, originalFileName: string): Promise<string> {
  const ext = path.extname(originalFileName);
  const baseName = path.basename(originalFileName, ext);
  let candidate = path.join(targetDir, originalFileName);
  let counter = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(targetDir, `${baseName} (${counter})${ext}`);
    counter++;
  }

  return candidate;
}

/**
 * Recursively removes empty subdirectories inside a root directory (does not remove rootDir itself).
 */
async function cleanEmptyDirectories(dir: string, rootDir: string): Promise<void> {
  if (!fs.existsSync(dir) || path.resolve(dir) === path.resolve(rootDir)) {
    return;
  }

  const entries = await fs.promises.readdir(dir);
  if (entries.length === 0) {
    try {
      await fs.promises.rmdir(dir);
      // Clean parent recursively up to rootDir
      await cleanEmptyDirectories(path.dirname(dir), rootDir);
    } catch {
      // Ignore if cannot remove
    }
  }
}

/**
 * Creates a flattened DJ set folder by moving (default) or copying audio files.
 */
export async function createDjSet(request: CreateDjSetRequest): Promise<CreateDjSetResult> {
  const settings = store.getSettings();
  const sessionName = sanitize(request.sessionName.trim()) || `DJ_Set_${Date.now()}`;
  const libraryRoot = settings.defaultLibraryDir || path.resolve(process.cwd(), 'library');
  const targetDir = request.targetDirectory
    ? path.resolve(request.targetDirectory)
    : path.resolve(libraryRoot, sessionName);

  const copyMode = Boolean(request.copyMode); // false by default -> moves files physically
  const cleanEmpty = request.cleanEmptyFolders ?? !copyMode;

  if (!fs.existsSync(targetDir)) {
    await fs.promises.mkdir(targetDir, { recursive: true });
  }

  const trackPaths = request.trackPaths || [];
  const errors: { filePath: string; error: string }[] = [];
  let processedCount = 0;
  const parentFoldersToClean = new Set<string>();

  for (const srcPath of trackPaths) {
    const resolvedSrc = path.resolve(srcPath);

    if (!fs.existsSync(resolvedSrc)) {
      errors.push({ filePath: srcPath, error: 'Source file not found' });
      continue;
    }

    // Do not process if file is already inside targetDir
    if (path.dirname(resolvedSrc) === targetDir) {
      processedCount++;
      continue;
    }

    const fileName = path.basename(resolvedSrc);
    const destPath = await getUniqueDestinationPath(targetDir, fileName);
    const parentDir = path.dirname(resolvedSrc);
    parentFoldersToClean.add(parentDir);

    try {
      if (copyMode) {
        await fs.promises.copyFile(resolvedSrc, destPath);
      } else {
        try {
          await fs.promises.rename(resolvedSrc, destPath);
        } catch (renameErr: any) {
          // EXDEV fallback for cross-partition moves
          if (renameErr.code === 'EXDEV') {
            await fs.promises.copyFile(resolvedSrc, destPath);
            await fs.promises.unlink(resolvedSrc);
          } else {
            throw renameErr;
          }
        }
      }
      processedCount++;
    } catch (err: any) {
      console.error(`[DjSet] Failed to ${copyMode ? 'copy' : 'move'} ${resolvedSrc}:`, err);
      errors.push({ filePath: srcPath, error: err.message || 'I/O operation failed' });
    }
  }

  // Clean empty folders if moving files
  if (!copyMode && cleanEmpty && request.sourceDirectory) {
    const resolvedSourceRoot = path.resolve(request.sourceDirectory);
    for (const folder of parentFoldersToClean) {
      await cleanEmptyDirectories(folder, resolvedSourceRoot);
    }
  }

  const result: CreateDjSetResult = {
    success: errors.length === 0 || processedCount > 0,
    sessionName,
    targetDirectory: targetDir,
    totalRequested: trackPaths.length,
    processedCount,
    failedCount: errors.length,
    copyMode,
    errors,
  };

  if (processedCount > 0) {
    store.addOrUpdateDjSet({
      name: sessionName,
      path: targetDir,
      trackCount: processedCount,
    });
  }

  return result;
}

const SUPPORTED_AUDIO_EXTS = new Set([
  '.mp3',
  '.flac',
  '.wav',
  '.aiff',
  '.aif',
  '.m4a',
  '.aac',
  '.ogg',
  '.opus',
  '.wma',
]);

/**
 * Returns a list of all registered DJ sets and discovered subfolders in the library directory.
 */
export async function listDjSets(): Promise<import('../../../shared/types.js').DjSetItem[]> {
  const registeredSets = store.getDjSets();
  const validSets: import('../../../shared/types.js').DjSetItem[] = [];
  const knownPaths = new Set<string>();

  // 1. Verify registered sets exist on disk
  for (const set of registeredSets) {
    if (fs.existsSync(set.path)) {
      try {
        const files = await fs.promises.readdir(set.path);
        const audioCount = files.filter((f) =>
          SUPPORTED_AUDIO_EXTS.has(path.extname(f).toLowerCase())
        ).length;
        set.trackCount = audioCount;
        validSets.push(set);
        knownPaths.add(path.resolve(set.path).toLowerCase());
      } catch {
        // Skip inaccessible
      }
    } else {
      store.deleteDjSet(set.id);
    }
  }

  // 2. Discover subdirectories in default library dir
  const settings = store.getSettings();
  if (settings.defaultLibraryDir && fs.existsSync(settings.defaultLibraryDir)) {
    try {
      const entries = await fs.promises.readdir(settings.defaultLibraryDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.resolve(settings.defaultLibraryDir, entry.name);
          if (!knownPaths.has(dirPath.toLowerCase())) {
            try {
              const files = await fs.promises.readdir(dirPath);
              const audioCount = files.filter((f) =>
                SUPPORTED_AUDIO_EXTS.has(path.extname(f).toLowerCase())
              ).length;

              if (audioCount > 0) {
                const newSet = store.addOrUpdateDjSet({
                  name: entry.name,
                  path: dirPath,
                  trackCount: audioCount,
                });
                validSets.push(newSet);
                knownPaths.add(dirPath.toLowerCase());
              }
            } catch {
              // Ignore
            }
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  return validSets;
}

/**
 * Permanently deletes audio files from disk and cleans up empty parent directories.
 */
export async function deleteTracks(
  filePaths: string[],
  sourceDirectory?: string
): Promise<{ success: boolean; deletedCount: number; errors: { filePath: string; error: string }[] }> {
  const errors: { filePath: string; error: string }[] = [];
  let deletedCount = 0;
  const parentFoldersToClean = new Set<string>();

  for (const filePath of filePaths) {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      errors.push({ filePath, error: 'File does not exist' });
      continue;
    }

    const parentDir = path.dirname(resolvedPath);
    parentFoldersToClean.add(parentDir);

    try {
      await fs.promises.unlink(resolvedPath);
      deletedCount++;
    } catch (err: any) {
      console.error(`[DeleteTracks] Failed to delete ${resolvedPath}:`, err);
      errors.push({ filePath, error: err.message || 'Failed to delete file' });
    }
  }

  if (sourceDirectory) {
    const resolvedSourceRoot = path.resolve(sourceDirectory);
    for (const folder of parentFoldersToClean) {
      await cleanEmptyDirectories(folder, resolvedSourceRoot);
    }
  }

  return {
    success: errors.length === 0 || deletedCount > 0,
    deletedCount,
    errors,
  };
}

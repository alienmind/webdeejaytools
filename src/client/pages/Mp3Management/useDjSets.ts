import { useCallback, useEffect, useState } from 'react';
import { AppSettings, CreateDjSetResult, DjSetItem, LocalTrackItem } from '../../../shared/types.js';
import { api } from '../../services/api.js';
import { useToast } from '../../components/Toast.js';
import { joinPath } from './utils.js';

/**
 * DJ set creation, the created-sets list, and physical deletion.
 *
 * These three share a lifecycle - each one changes what is on disk and therefore invalidates the
 * current scan - so they live together and expose a single `onDiskChanged` callback for the view.
 */
export function useDjSets(settings: AppSettings, onDiskChanged: () => void | Promise<void>) {
  const toast = useToast();

  const [djSets, setDjSets] = useState<DjSetItem[]>([]);

  const [sessionName, setSessionName] = useState('');
  const [customTargetDir, setCustomTargetDir] = useState('');
  const [copyMode, setCopyMode] = useState(false);
  const [cleanEmptyFolders, setCleanEmptyFolders] = useState(true);
  const [isCreatingSet, setIsCreatingSet] = useState(false);
  const [isBrowsingTarget, setIsBrowsingTarget] = useState(false);
  const [djSetResult, setDjSetResult] = useState<CreateDjSetResult | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{
    success: boolean;
    count: number;
    errors: { filePath: string; error: string }[];
  } | null>(null);

  const loadDjSets = useCallback(async () => {
    const sets = await api.listDjSets();
    setDjSets(sets);
  }, []);

  useEffect(() => {
    void loadDjSets();
  }, [loadDjSets, settings.defaultLibraryDir]);

  const prepareCreate = useCallback(() => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
    setSessionName(`DJ_Set_${dateStr}`);
    setCustomTargetDir('');
    setCopyMode(false);
    setCleanEmptyFolders(true);
    setDjSetResult(null);
  }, []);

  const browseTargetDir = useCallback(
    async (fallback: string) => {
      try {
        setIsBrowsingTarget(true);
        const base = customTargetDir || settings.defaultLibraryDir || fallback;
        const res = await api.browseDirectory(base, 'Select Target Library Folder');
        if (!res.canceled && res.path) setCustomTargetDir(res.path);
      } catch (err: any) {
        toast.error('Could not open the folder picker', err?.message);
      } finally {
        setIsBrowsingTarget(false);
      }
    },
    [customTargetDir, settings.defaultLibraryDir, toast]
  );

  const createDjSet = useCallback(
    async (tracks: LocalTrackItem[], sourceDirectory: string) => {
      if (!sessionName.trim()) return;

      try {
        setIsCreatingSet(true);
        const libraryRoot = settings.defaultLibraryDir || sourceDirectory;
        // Built with the separator already present in the configured root, rather than a
        // hardcoded backslash, so this works on macOS and Linux too.
        const targetDir = customTargetDir.trim() || joinPath(libraryRoot, sessionName.trim());

        const res = await api.createDjSet({
          sourceDirectory,
          targetDirectory: targetDir,
          sessionName: sessionName.trim(),
          trackPaths: tracks.map((t) => t.filePath),
          copyMode,
          cleanEmptyFolders,
        });

        setDjSetResult(res);

        if (res.success) {
          toast.success(
            `DJ set "${res.sessionName}" created`,
            `${res.processedCount} of ${res.totalRequested} tracks ${copyMode ? 'copied' : 'moved'}`
          );
          await loadDjSets();
          await onDiskChanged();
        } else {
          toast.error('DJ set creation failed', res.errors[0]?.error);
        }
      } catch (err: any) {
        toast.error('Could not create the DJ set', err?.message);
      } finally {
        setIsCreatingSet(false);
      }
    },
    [sessionName, customTargetDir, copyMode, cleanEmptyFolders, settings.defaultLibraryDir, toast, loadDjSets, onDiskChanged]
  );

  const deleteTracks = useCallback(
    async (tracks: LocalTrackItem[], sourceDirectory: string) => {
      if (tracks.length === 0) return;

      try {
        setIsDeleting(true);
        const res = await api.deleteTracks(
          tracks.map((t) => t.filePath),
          sourceDirectory
        );

        setDeleteResult({ success: res.success, count: res.deletedCount, errors: res.errors });

        if (res.deletedCount > 0) {
          toast.success(`Deleted ${res.deletedCount} file${res.deletedCount === 1 ? '' : 's'}`);
          await loadDjSets();
          await onDiskChanged();
        }
        if (res.errors.length > 0) {
          toast.error(`${res.errors.length} file(s) could not be deleted`, res.errors[0]?.error);
        }
      } catch (err: any) {
        toast.error('Could not delete the selected files', err?.message);
      } finally {
        setIsDeleting(false);
      }
    },
    [toast, loadDjSets, onDiskChanged]
  );

  return {
    djSets,
    loadDjSets,

    sessionName,
    setSessionName,
    customTargetDir,
    setCustomTargetDir,
    copyMode,
    setCopyMode,
    cleanEmptyFolders,
    setCleanEmptyFolders,
    isCreatingSet,
    isBrowsingTarget,
    djSetResult,
    setDjSetResult,
    prepareCreate,
    browseTargetDir,
    createDjSet,

    isDeleting,
    deleteResult,
    setDeleteResult,
    deleteTracks,
  };
}

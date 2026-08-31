import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppSettings, LocalTrackItem, ScanDirectoryResult } from '../../../shared/types.js';
import { api } from '../../services/api.js';
import { useToast } from '../../components/Toast.js';

export type SortField =
  | 'custom'
  | 'artist'
  | 'title'
  | 'album'
  | 'bpm'
  | 'key'
  | 'duration'
  | 'size';

/**
 * Owns everything about the scanned library: the scan itself, filtering, sorting, pagination,
 * selection, and manual reordering.
 *
 * Extracted from the page component, which held 56 useState calls in a single 2755-line function.
 * Pulling the state out is what actually makes the view tractable - and makes this logic reachable
 * from a test without mounting the whole page.
 */
export function useLibrary(settings: AppSettings) {
  const toast = useToast();

  const [scanPath, setScanPath] = useState<string>(
    settings.defaultDownloadDir || settings.defaultLibraryDir || ''
  );
  const [isScanning, setIsScanning] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanDirectoryResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortField>('artist');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [pageSize, setPageSize] = useState<number | 'all'>(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const scan = useCallback(
    async (pathOverride?: string) => {
      const target = (pathOverride || scanPath).trim();
      if (!target) return;

      try {
        setIsScanning(true);
        setScanError(null);
        const res = await api.scanLocalDirectory(target);
        setScanResult(res);
        setSelectedIds(new Set(res.tracks.map((t) => t.id)));
        setCurrentPage(1);
      } catch (err: any) {
        const message = err?.message || 'Failed to scan directory';
        setScanError(message);
        toast.error('Scan failed', message);
      } finally {
        setIsScanning(false);
      }
    },
    [scanPath, toast]
  );

  const browseFolder = useCallback(async () => {
    try {
      setIsBrowsing(true);
      const res = await api.browseDirectory(scanPath, 'Select Music Folder to Scan');
      if (!res.canceled && res.path) {
        setScanPath(res.path);
        await scan(res.path);
      }
    } catch (err: any) {
      toast.error('Could not open the folder picker', err?.message);
    } finally {
      setIsBrowsing(false);
    }
  }, [scanPath, scan, toast]);

  // Auto-scan the configured directory on first load and whenever the defaults change.
  useEffect(() => {
    const initial = settings.defaultDownloadDir || settings.defaultLibraryDir;
    if (!initial) return;
    setScanPath(initial);
    void scan(initial);
    // `scan` depends on scanPath, which this effect also sets; including it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.defaultDownloadDir, settings.defaultLibraryDir]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, formatFilter, sortBy, sortOrder, pageSize]);

  const filteredTracks = useMemo(() => {
    if (!scanResult) return [];

    const list = scanResult.tracks.filter((t) => {
      if (formatFilter !== 'all' && !t.extension.toLowerCase().includes(formatFilter.toLowerCase())) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q) ||
          t.relativeSubPath.toLowerCase().includes(q) ||
          t.fileName.toLowerCase().includes(q)
        );
      }

      return true;
    });

    // 'custom' preserves the order produced by a smart reorder or a manual drag.
    if (sortBy !== 'custom') {
      list.sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'artist') {
          comparison = a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title);
        } else if (sortBy === 'title') {
          comparison = a.title.localeCompare(b.title);
        } else if (sortBy === 'album') {
          comparison = a.album.localeCompare(b.album) || (a.trackNumber || 0) - (b.trackNumber || 0);
        } else if (sortBy === 'bpm') {
          comparison = (a.bpm || 0) - (b.bpm || 0);
        } else if (sortBy === 'key') {
          comparison = (a.key || '').localeCompare(b.key || '');
        } else if (sortBy === 'duration') {
          comparison = (a.durationSec || 0) - (b.durationSec || 0);
        } else if (sortBy === 'size') {
          comparison = a.fileSize - b.fileSize;
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    }

    return list;
  }, [scanResult, searchQuery, formatFilter, sortBy, sortOrder]);

  const totalPages = useMemo(() => {
    if (pageSize === 'all' || filteredTracks.length === 0) return 1;
    return Math.ceil(filteredTracks.length / pageSize);
  }, [filteredTracks.length, pageSize]);

  const paginatedTracks = useMemo(() => {
    if (pageSize === 'all') return filteredTracks;
    const start = (currentPage - 1) * pageSize;
    return filteredTracks.slice(start, start + pageSize);
  }, [filteredTracks, currentPage, pageSize]);

  const startRowIndex =
    filteredTracks.length === 0 ? 0 : pageSize === 'all' ? 1 : (currentPage - 1) * pageSize + 1;
  const endRowIndex =
    pageSize === 'all' ? filteredTracks.length : Math.min(currentPage * pageSize, filteredTracks.length);

  const pageNumbers = useMemo<(number | string)[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (currentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  }, [totalPages, currentPage]);

  const totalSizeBytes = useMemo(
    () => (scanResult?.tracks || []).reduce((acc, t) => acc + t.fileSize, 0),
    [scanResult]
  );

  const totalDurationSeconds = useMemo(
    () => (scanResult?.tracks || []).reduce((acc, t) => acc + (t.durationSec || 0), 0),
    [scanResult]
  );

  const selectedTracksList = useMemo(
    () => (scanResult ? scanResult.tracks.filter((t) => selectedIds.has(t.id)) : []),
    [scanResult, selectedIds]
  );

  const selectedSizeBytes = useMemo(
    () => selectedTracksList.reduce((acc, t) => acc + t.fileSize, 0),
    [selectedTracksList]
  );

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === filteredTracks.length && filteredTracks.length > 0
        ? new Set()
        : new Set(filteredTracks.map((t) => t.id))
    );
  }, [filteredTracks]);

  const toggleTrack = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Replaces the track order, switching the view into custom-order mode. */
  const setTrackOrder = useCallback((tracks: LocalTrackItem[]) => {
    setScanResult((prev) => (prev ? { ...prev, tracks } : prev));
    setSortBy('custom');
  }, []);

  /** Moves one track to another track's position. Used by both drag and keyboard reordering. */
  const moveTrack = useCallback(
    (fromId: string, toId: string) => {
      if (!scanResult || fromId === toId) return;
      const fromIdx = scanResult.tracks.findIndex((t) => t.id === fromId);
      const toIdx = scanResult.tracks.findIndex((t) => t.id === toId);
      if (fromIdx === -1 || toIdx === -1) return;

      const next = [...scanResult.tracks];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      setTrackOrder(next);
    },
    [scanResult, setTrackOrder]
  );

  /** Applies a per-file metadata patch in place - used for live analysis results. */
  const patchTrackByPath = useCallback((filePath: string, patch: Partial<LocalTrackItem>) => {
    setScanResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tracks: prev.tracks.map((t) => (t.filePath === filePath ? { ...t, ...patch } : t)),
      };
    });
  }, []);

  return {
    // scan
    scanPath,
    setScanPath,
    isScanning,
    isBrowsing,
    scanResult,
    setScanResult,
    scanError,
    scan,
    browseFolder,

    // filters
    searchQuery,
    setSearchQuery,
    formatFilter,
    setFormatFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,

    // pagination
    pageSize,
    setPageSize,
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedTracks,
    startRowIndex,
    endRowIndex,
    pageNumbers,

    // derived
    filteredTracks,
    totalSizeBytes,
    totalDurationSeconds,
    selectedTracksList,
    selectedSizeBytes,

    // selection & ordering
    selectedIds,
    setSelectedIds,
    toggleSelectAll,
    toggleTrack,
    setTrackOrder,
    moveTrack,
    patchTrackByPath,
  };
}

export type LibraryState = ReturnType<typeof useLibrary>;

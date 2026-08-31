import React, { useMemo, useState } from 'react';
import {
  FolderOpen,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Disc3,
  Layers,
  Clock,
  HardDrive,
  CheckSquare,
  AlertTriangle,
  Trash2,
  Sparkles,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Wand2,
  Activity,
  Compass,
  ListMusic,
} from 'lucide-react';
import { AppSettings, LocalTrackItem } from '../../../shared/types.js';
import {
  smartReorderTracks,
  SmartReorderResult,
} from '../../../shared/harmonic.js';
import { exportPlaylist, PlaylistExportFormat } from '../../../shared/playlistExporter.js';
import { CamelotWheelModal } from '../../components/CamelotWheelModal.js';
import { useToast } from '../../components/Toast.js';
import { TrackTable } from './components/TrackTable.js';
import { DjSetModal } from './components/DjSetModal.js';
import { DeleteModal } from './components/DeleteModal.js';
import { SmartReorderModal } from './components/SmartReorderModal.js';
import { ExportPlaylistModal } from './components/ExportPlaylistModal.js';
import { AnalyzeModal } from './components/AnalyzeModal.js';
import { AudioPreviewBar } from './components/AudioPreviewBar.js';
import { useLibrary } from './useLibrary.js';
import { useAudioPreview } from './useAudioPreview.js';
import { useAnalysis } from './useAnalysis.js';
import { useDjSets } from './useDjSets.js';
import { basename, formatBytes, formatTotalDuration } from './utils.js';

interface Mp3ManagementPageProps {
  settings: AppSettings;
}

export const Mp3ManagementPage: React.FC<Mp3ManagementPageProps> = ({ settings }) => {
  const toast = useToast();

  // Library state (scan, filters, sorting, pagination, selection, ordering) lives in useLibrary.
  const library = useLibrary(settings);
  const {
    scanPath,
    setScanPath,
    isScanning,
    isBrowsing,
    scanResult,
    scanError,
    searchQuery,
    setSearchQuery,
    formatFilter,
    setFormatFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    pageSize,
    setPageSize,
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedTracks,
    startRowIndex,
    endRowIndex,
    pageNumbers,
    filteredTracks,
    totalSizeBytes,
    totalDurationSeconds,
    selectedTracksList,
    selectedSizeBytes,
    selectedIds,
    setTrackOrder,
    moveTrack,
    patchTrackByPath,
  } = library;

  const handleScan = library.scan;
  const handleBrowseFolder = library.browseFolder;
  const handleToggleSelectAll = library.toggleSelectAll;
  const handleToggleTrack = library.toggleTrack;

  // Audio preview player.
  const preview = useAudioPreview(() => filteredTracks);
  const {
    playingTrack,
    isPlaying,
    playbackTime,
    playbackDuration,
    volume,
    isMuted,
    play: handlePlayTrack,
    togglePlayPause: handleTogglePlayPause,
    next: handleNextTrack,
    previous: handlePrevTrack,
    seek: handleSeek,
    changeVolume: handleVolumeChange,
    toggleMute: handleToggleMute,
    close: handleClosePlayer,
  } = preview;

  // DJ sets: creation, the created-set list, and physical deletion.
  const djSetState = useDjSets(settings, () => handleScan());
  const {
    djSets,
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
    isDeleting,
    deleteResult,
    setDeleteResult,
  } = djSetState;

  // BPM and key analysis, driven by the server-side job API.
  const analysis = useAnalysis({
    onTrackAnalyzed: patchTrackByPath,
    onFinished: () => handleScan(),
  });
  const {
    isAnalyzing,
    writeTags: analyzeWriteTags,
    setWriteTags: setAnalyzeWriteTags,
    scope: analyzeScope,
    setScope: setAnalyzeScope,
    results: analyzeResults,
    liveResults: analyzeLiveResults,
    progress: rawAnalyzeProgress,
  } = analysis;

  // Kept in the shape the existing markup expects.
  const analyzeProgress = rawAnalyzeProgress;

  const [copiedPathId, setCopiedPathId] = useState<string | null>(null);

  // DJ Set modal
  const [isDjModalOpen, setIsDjModalOpen] = useState<boolean>(false);

  // Delete modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);

  // Smart Reorder modal (Camelot wheel & BPM dynamics)
  const [isSmartReorderModalOpen, setIsSmartReorderModalOpen] = useState<boolean>(false);
  const [useBpm, setUseBpm] = useState<boolean>(true);
  const [useKey, setUseKey] = useState<boolean>(true);
  const [keyThreshold, setKeyThreshold] = useState<0 | 1 | 2>(1);
  const [bpmCurve, setBpmCurve] = useState<'wave' | 'ascending'>('wave');
  const [smartReorderSuccess, setSmartReorderSuccess] = useState<boolean>(false);

  // Camelot wheel modal
  const [isCamelotModalOpen, setIsCamelotModalOpen] = useState<boolean>(false);
  const [selectedCamelotKey, setSelectedCamelotKey] = useState<string | undefined>(undefined);

  // Export playlist modal
  const [isExportPlaylistModalOpen, setIsExportPlaylistModalOpen] = useState<boolean>(false);
  const [exportPlaylistName, setExportPlaylistName] = useState<string>('DJ_Set');
  const [exportFormat, setExportFormat] = useState<PlaylistExportFormat>('m3u8');
  const [exportUseRelativePaths, setExportUseRelativePaths] = useState<boolean>(true);
  const [exportIncludeHarmonicInfo, setExportIncludeHarmonicInfo] = useState<boolean>(true);
  const [exportScope, setExportScope] = useState<'all' | 'selected'>('all');
  const [exportToastMessage, setExportToastMessage] = useState<string | null>(null);

  // Analyze modal
  const [isAnalyzeModalOpen, setIsAnalyzeModalOpen] = useState<boolean>(false);

  const handleBrowseTargetDir = () => djSetState.browseTargetDir(scanPath);

  // Live preview computation for Smart Reorder Modal  // Live preview computation for Smart Reorder Modal
  const smartReorderPreview: SmartReorderResult | null = useMemo(() => {
    if (!scanResult || scanResult.tracks.length === 0) return null;
    const targetTracks =
      selectedIds.size > 0
        ? scanResult.tracks.filter((t) => selectedIds.has(t.id))
        : scanResult.tracks;

    return smartReorderTracks(targetTracks, {
      useBpm,
      useKey,
      keyThreshold,
      bpmCurve,
    });
  }, [scanResult, selectedIds, useBpm, useKey, keyThreshold, bpmCurve]);

  // Apply Smart Reorder to Library
  const handleApplySmartReorder = () => {
    if (!smartReorderPreview || !scanResult) return;

    let nextTracks: LocalTrackItem[] = [];
    if (selectedIds.size > 0 && selectedIds.size < scanResult.tracks.length) {
      let reorderedIdx = 0;
      nextTracks = scanResult.tracks.map((t) => {
        if (selectedIds.has(t.id)) {
          return smartReorderPreview.tracks[reorderedIdx++];
        }
        return t;
      });
    } else {
      nextTracks = smartReorderPreview.tracks;
    }

    setTrackOrder(nextTracks);
    setCurrentPage(1);
    setIsSmartReorderModalOpen(false);
    setSmartReorderSuccess(true);
    setTimeout(() => setSmartReorderSuccess(false), 4000);
  };

  // Export Playlist Handlers  // Export Playlist Handlers
  const handleOpenExportModal = () => {
    setExportPlaylistName(scanPath ? basename(scanPath) || 'DJ_Set' : 'DJ_Set');
    setExportScope(selectedIds.size > 0 ? 'selected' : 'all');
    setIsExportPlaylistModalOpen(true);
  };

  const handleDownloadPlaylist = () => {
    if (!scanResult) return;
    const tracksToExport =
      exportScope === 'selected' && selectedIds.size > 0
        ? scanResult.tracks.filter((t) => selectedIds.has(t.id))
        : scanResult.tracks;

    if (tracksToExport.length === 0) return;

    const exportResult = exportPlaylist(tracksToExport, {
      playlistName: exportPlaylistName,
      format: exportFormat,
      useRelativePaths: exportUseRelativePaths,
      baseDirectory: scanPath,
      includeHarmonicInfoInTitle: exportIncludeHarmonicInfo,
    });

    const blob = new Blob([exportResult.content], { type: exportResult.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportResult.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setIsExportPlaylistModalOpen(false);
    setExportToastMessage(`Saved ${exportResult.filename} (${tracksToExport.length} tracks)`);
    setTimeout(() => setExportToastMessage(null), 4500);
  };

  const handleCopyPath = (filePath: string, id: string) => {
    void navigator.clipboard.writeText(filePath).catch(() => {
      toast.error('Could not copy the path to the clipboard');
    });
    setCopiedPathId(id);
    setTimeout(() => setCopiedPathId(null), 2000);
  };

  // Open DJ Set Modal
  const handleOpenDjModal = () => {
    djSetState.prepareCreate();
    setIsDjModalOpen(true);
  };

  // Open Delete Modal
  const handleOpenDeleteModal = () => {
    setDeleteResult(null);
    setIsDeleteModalOpen(true);
  };

  // Open BPM & Key Analysis Modal
  const handleOpenAnalyzeModal = () => {
    analysis.reset();
    setIsAnalyzeModalOpen(true);
  };

  // Execute BPM & Key analysis. The batch runs as a server-side job in the worker pool.
  const handleStartAnalysis = async () => {
    if (!scanResult || scanResult.tracks.length === 0) return;
    await analysis.start(analysis.selectTargets(scanResult.tracks, selectedIds));
  };

  const handleCancelAnalysis = () => analysis.cancel();

  const handleCreateDjSet = async () => {
    await djSetState.createDjSet(selectedTracksList, scanPath);
  };

  const handleDeleteTracks = async () => {
    await djSetState.deleteTracks(selectedTracksList, scanPath);
    setIsDeleteModalOpen(false);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-glow-emerald">
              <ListMusic className="w-6 h-6 text-white" />
            </div>
            <span>MP3 & Collection Management</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Recursively scan folders, preview embedded tags, BPM, key, manage files, and flatten libraries into curated DJ sets.
          </p>
        </div>
      </div>

      {/* Directory Selector Bar */}
      <div className="bg-[#111827] border border-[#1e293b] rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={scanPath}
              onChange={(e) => setScanPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
              placeholder="e.g. D:\MP3LIBRARY\downloads or D:\MP3LIBRARY"
              className="flex-1 px-4 py-2.5 bg-[#090d16] border border-[#1e293b] rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
            <button
              onClick={handleBrowseFolder}
              disabled={isBrowsing}
              className="px-4 py-2.5 rounded-xl bg-[#0e1626] hover:bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition-all shrink-0"
              title="Browse folder visually"
            >
              <FolderOpen className="w-4 h-4 text-emerald-400" />
              <span>{isBrowsing ? 'Browsing...' : 'Browse'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleScan()}
              disabled={isScanning || !scanPath.trim()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Scanning...' : 'Scan Directory'}</span>
            </button>
          </div>
        </div>

        {/* Quick Path Preset Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#1e293b]/60 text-xs">
          <span className="text-slate-500 font-medium mr-1">Quick Shortcuts:</span>
          {settings.defaultDownloadDir && (
            <button
              onClick={() => {
                setScanPath(settings.defaultDownloadDir);
                handleScan(settings.defaultDownloadDir);
              }}
              className={`px-3 py-1 rounded-lg border text-xs flex items-center gap-1.5 transition-all ${
                scanPath === settings.defaultDownloadDir
                  ? 'bg-cyan-950/70 border-cyan-500/50 text-cyan-300'
                  : 'bg-[#090d16] border-[#1e293b] text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              <span>Downloads: {settings.defaultDownloadDir}</span>
            </button>
          )}
          {settings.defaultLibraryDir && (
            <button
              onClick={() => {
                setScanPath(settings.defaultLibraryDir);
                handleScan(settings.defaultLibraryDir);
              }}
              className={`px-3 py-1 rounded-lg border text-xs flex items-center gap-1.5 transition-all ${
                scanPath === settings.defaultLibraryDir
                  ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                  : 'bg-[#090d16] border-[#1e293b] text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>Library: {settings.defaultLibraryDir}</span>
            </button>
          )}
        </div>

        {/* DJ Sets List Section directly below Quick Shortcuts */}
        {djSets.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#1e293b]/60 text-xs">
            <span className="text-violet-400 font-bold flex items-center gap-1 mr-1">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span>Created DJ Sets:</span>
            </span>
            {djSets.map((set) => (
              <button
                key={set.path}
                onClick={() => {
                  setScanPath(set.path);
                  handleScan(set.path);
                }}
                className={`px-3 py-1 rounded-lg border text-xs flex items-center gap-1.5 transition-all group ${
                  scanPath === set.path
                    ? 'bg-violet-950/80 border-violet-500 text-violet-200 font-semibold shadow-glow-violet'
                    : 'bg-[#090d16] border-violet-900/40 text-violet-300 hover:text-white hover:border-violet-600'
                }`}
                title={`Open DJ Set folder: ${set.path} (${set.trackCount} tracks)`}
              >
                <FolderOpen className="w-3.5 h-3.5 text-violet-400 group-hover:text-white" />
                <span className="font-bold">{set.name}</span>
                <span className="text-[10px] text-violet-400/80 font-mono">({set.trackCount} trk)</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error Banner */}
      {scanError && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{scanError}</span>
        </div>
      )}

      {/* Statistics Cards */}
      {scanResult && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-4 flex items-center gap-3.5">
            <div className="p-3 rounded-lg bg-emerald-950/80 border border-emerald-800/40 text-emerald-400">
              <Disc3 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Tracks</p>
              <p className="text-xl font-black text-white">{scanResult.totalFiles}</p>
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-4 flex items-center gap-3.5">
            <div className="p-3 rounded-lg bg-teal-950/80 border border-teal-800/40 text-teal-400">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Selected</p>
              <p className="text-xl font-black text-emerald-400">
                {selectedIds.size} <span className="text-xs font-normal text-slate-500">/ {scanResult.totalFiles}</span>
              </p>
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-4 flex items-center gap-3.5">
            <div className="p-3 rounded-lg bg-cyan-950/80 border border-cyan-800/40 text-cyan-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Size</p>
              <p className="text-xl font-black text-white">{formatBytes(totalSizeBytes)}</p>
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-4 flex items-center gap-3.5">
            <div className="p-3 rounded-lg bg-purple-950/80 border border-purple-800/40 text-purple-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Runtime</p>
              <p className="text-xl font-black text-white">{formatTotalDuration(totalDurationSeconds)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter & Toolbar */}
      {scanResult && (
        <div className="bg-[#111827] border border-[#1e293b] rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search artist, title, album, file..."
                className="w-full pl-9 pr-4 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Format Filter & Sorting Controls */}
            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              <div className="flex items-center gap-1 bg-[#090d16] p-1 rounded-xl border border-[#1e293b] text-xs">
                {['all', 'flac', 'mp3', 'wav'].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setFormatFilter(fmt)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                      formatFilter === fmt
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 bg-[#090d16] px-3 py-1.5 rounded-xl border border-[#1e293b] text-xs text-slate-300">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-500">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
                >
                  <option value="custom" className="bg-[#111827]">⚡ Smart / Custom Order</option>
                  <option value="artist" className="bg-[#111827]">Artist</option>
                  <option value="title" className="bg-[#111827]">Title</option>
                  <option value="album" className="bg-[#111827]">Album</option>
                  <option value="bpm" className="bg-[#111827]">BPM</option>
                  <option value="key" className="bg-[#111827]">Key</option>
                  <option value="duration" className="bg-[#111827]">Duration</option>
                  <option value="size" className="bg-[#111827]">Size</option>
                </select>
                {sortBy !== 'custom' && (
                  <button
                    onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                    className="text-slate-400 hover:text-emerald-400 font-bold ml-1"
                    title="Toggle Ascending / Descending"
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                )}
              </div>

              <button
                onClick={handleToggleSelectAll}
                className="px-3 py-1.5 rounded-xl bg-[#090d16] hover:bg-slate-800 border border-[#1e293b] text-slate-300 hover:text-white text-xs font-semibold transition-all"
              >
                {selectedIds.size === filteredTracks.length && filteredTracks.length > 0
                  ? 'Deselect All'
                  : 'Select All'}
              </button>
            </div>
          </div>

          {/* Smart Reorder Success Toast */}
          {smartReorderSuccess && (
            <div className="p-3 rounded-xl bg-violet-950/70 border border-violet-700/60 text-violet-200 text-xs flex items-center justify-between animate-fadeIn">
              <div className="flex items-center gap-2 font-semibold">
                <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
                <span>Smart Harmonic Reordering Applied! Sequence optimized by Camelot Wheel & BPM dynamics.</span>
              </div>
              <button
                onClick={() => setSmartReorderSuccess(false)}
                className="text-violet-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Action Bar directly above table */}
          <div className="pt-3 border-t border-[#1e293b]/70 flex flex-col lg:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>
                  Selected:{' '}
                  <strong className="text-white font-mono">
                    {selectedIds.size} / {scanResult.totalFiles} tracks
                  </strong>{' '}
                  <span className="text-slate-500">({formatBytes(selectedSizeBytes)})</span>
                </span>
              </div>

              {/* Rows per page selector in top bar */}
              <div className="flex items-center gap-1 bg-[#090d16] px-2 py-1 rounded-xl border border-[#1e293b] text-xs">
                <span className="text-[11px] text-slate-500 font-medium mr-1">Rows:</span>
                {[10, 20, 50, 'all'].map((sz) => (
                  <button
                    key={sz}
                    onClick={() => setPageSize(sz as any)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-semibold transition-all ${
                      pageSize === sz
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sz === 'all' ? 'All' : sz}
                  </button>
                ))}
              </div>

              {/* Quick page indicator if multi-page */}
              {totalPages > 1 && pageSize !== 'all' && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                  <span>Page {currentPage} of {totalPages}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1 rounded bg-[#090d16] hover:bg-slate-800 border border-[#1e293b] disabled:opacity-40"
                      title="Previous Page"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1 rounded bg-[#090d16] hover:bg-slate-800 border border-[#1e293b] disabled:opacity-40"
                      title="Next Page"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-end">
              {/* Camelot Wheel Visualizer Button */}
              <button
                onClick={() => {
                  setSelectedCamelotKey(undefined);
                  setIsCamelotModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-[#090d19] hover:bg-violet-950/80 border border-violet-800/40 text-violet-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                title="Open interactive Camelot Wheel Harmonic Mixing Chart"
              >
                <Compass className="w-3.5 h-3.5 text-violet-400" />
                <span>Camelot Wheel</span>
              </button>

              {/* Analyze BPM & Key Button */}
              <button
                onClick={handleOpenAnalyzeModal}
                disabled={!scanResult || scanResult.tracks.length === 0}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md ${
                  scanResult && scanResult.tracks.length > 0
                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-glow-amber cursor-pointer active:scale-95 border border-amber-400/30'
                    : 'bg-[#090d16] text-slate-600 border border-[#1e293b] cursor-not-allowed opacity-50'
                }`}
                title="Detect BPM & Camelot Key using backend DSP analysis engine"
              >
                <Activity className="w-3.5 h-3.5 text-amber-200" />
                <span>Analyze BPM & Key</span>
              </button>

              {/* Smart Reorder Button */}
              <button
                onClick={() => setIsSmartReorderModalOpen(true)}
                disabled={!scanResult || scanResult.tracks.length === 0}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md ${
                  scanResult && scanResult.tracks.length > 0
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-glow-violet cursor-pointer active:scale-95 border border-violet-400/30'
                    : 'bg-[#090d16] text-slate-600 border border-[#1e293b] cursor-not-allowed opacity-50'
                }`}
                title="Smart reorder set using Camelot wheel harmonic mixing & BPM wave dynamics"
              >
                <Wand2 className="w-3.5 h-3.5 text-violet-300" />
                <span>Smart Reorder {selectedIds.size > 0 && selectedIds.size < scanResult.tracks.length ? `(${selectedIds.size})` : ''}</span>
              </button>

              {/* Save as Playlist Button */}
              <button
                onClick={handleOpenExportModal}
                disabled={!scanResult || scanResult.tracks.length === 0}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md ${
                  scanResult && scanResult.tracks.length > 0
                    ? 'bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white shadow-glow-blue cursor-pointer active:scale-95 border border-sky-400/30'
                    : 'bg-[#090d16] text-slate-600 border border-[#1e293b] cursor-not-allowed opacity-50'
                }`}
                title="Export and download playlist in universal DJ format (Extended M3U8, Rekordbox XML, etc.)"
              >
                <ListMusic className="w-3.5 h-3.5 text-sky-200" />
                <span>Save as Playlist {selectedIds.size > 0 && selectedIds.size < scanResult.tracks.length ? `(${selectedIds.size})` : ''}</span>
              </button>

              {/* Delete Button (Destructive with Red Warnings) */}
              <button
                onClick={handleOpenDeleteModal}
                disabled={selectedIds.size === 0}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md ${
                  selectedIds.size > 0
                    ? 'bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white shadow-glow-red cursor-pointer active:scale-95 border border-red-500/30'
                    : 'bg-[#090d16] text-slate-600 border border-[#1e293b] cursor-not-allowed opacity-50'
                }`}
                title="Permanently delete selected files from disk"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-300" />
                <span>Delete ({selectedIds.size})</span>
              </button>

              {/* Create DJ Set Button */}
              <button
                onClick={handleOpenDjModal}
                disabled={selectedIds.size === 0}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md ${
                  selectedIds.size > 0
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-glow-emerald cursor-pointer active:scale-95 border border-emerald-400/30'
                    : 'bg-[#090d16] text-slate-600 border border-[#1e293b] cursor-not-allowed opacity-50'
                }`}
                title="Create a new flattened DJ set session folder"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-300 animate-spin" style={{ animationDuration: '4s' }} />
                <span>Create DJ Set ({selectedIds.size})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Playlist Toast */}
      {exportToastMessage && (
        <div className="p-3 rounded-xl bg-sky-950/80 border border-sky-600/70 text-sky-200 text-xs flex items-center justify-between animate-fadeIn shadow-lg">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
            <span>{exportToastMessage}</span>
          </div>
          <button onClick={() => setExportToastMessage(null)} className="text-sky-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Track Table */}
      {scanResult && (
        <div className="bg-[#111827] border border-[#1e293b] rounded-2xl overflow-hidden shadow-2xl">
          <TrackTable
            tracks={paginatedTracks}
            allFilteredCount={filteredTracks.length}
            selectedIds={selectedIds}
            playingTrackId={playingTrack?.id}
            isPlaying={isPlaying}
            copiedPathId={copiedPathId}
            onToggleTrack={handleToggleTrack}
            onToggleSelectAll={handleToggleSelectAll}
            onPlay={handlePlayTrack}
            onCopyPath={handleCopyPath}
            onOpenKey={(key) => {
              setSelectedCamelotKey(key);
              setIsCamelotModalOpen(true);
            }}
            onReorder={moveTrack}
          />

          {/* Footer Bar with Pagination */}
          <div className="p-4 bg-[#090d16]/70 border-t border-[#1e293b] flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div>
              Showing <span className="text-white font-bold">{startRowIndex}–{endRowIndex}</span> of{' '}
              <span className="text-white font-bold">{filteredTracks.length}</span> tracks
              {filteredTracks.length !== scanResult.totalFiles && (
                <span className="text-slate-500"> ({scanResult.totalFiles} total)</span>
              )}
            </div>

            {/* Pagination Number Controls */}
            {totalPages > 1 && pageSize !== 'all' && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg bg-[#090d16] hover:bg-slate-800 border border-[#1e293b] text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
                  title="First Page"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg bg-[#090d16] hover:bg-slate-800 border border-[#1e293b] text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {pageNumbers.map((p, idx) =>
                  typeof p === 'number' ? (
                    <button
                      key={idx}
                      onClick={() => setCurrentPage(p)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                        currentPage === p
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-[#090d16] border border-[#1e293b] text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {p}
                    </button>
                  ) : (
                    <span key={idx} className="px-1 text-slate-600 text-xs">
                      ...
                    </span>
                  )
                )}

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg bg-[#090d16] hover:bg-slate-800 border border-[#1e293b] text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg bg-[#090d16] hover:bg-slate-800 border border-[#1e293b] text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
                  title="Last Page"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Page Size & Selection Summary */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-[#090d16] px-2 py-1 rounded-xl border border-[#1e293b]">
                <span className="text-[10px] text-slate-500 font-medium mr-1">Rows:</span>
                {[10, 20, 50, 'all'].map((sz) => (
                  <button
                    key={sz}
                    onClick={() => setPageSize(sz as any)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-semibold transition-all ${
                      pageSize === sz
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sz === 'all' ? 'All' : sz}
                  </button>
                ))}
              </div>

              <span>
                Selected:{' '}
                <strong className="text-emerald-400">
                  {selectedIds.size}
                </strong>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Initial Empty State (if no scan yet) */}
      {!scanResult && !isScanning && !scanError && (
        <div className="bg-[#111827] border border-[#1e293b] rounded-2xl p-12 text-center shadow-xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 flex items-center justify-center mx-auto shadow-glow-emerald">
            <ListMusic className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-lg font-bold text-white">No Directory Scanned</h3>
            <p className="text-xs text-slate-400 mt-1">
              Select or browse a folder above (e.g. <code className="text-emerald-300">D:\MP3LIBRARY\downloads</code>) and click <strong>Scan Directory</strong> to load your audio collection.
            </p>
          </div>
          <button
            onClick={() => handleScan()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md transition-all"
          >
            Scan Current Directory
          </button>
        </div>
      )}

      {/* DJ Set Creation Modal */}
      <DjSetModal
        isOpen={isDjModalOpen}
        onClose={() => setIsDjModalOpen(false)}
        sessionName={sessionName}
        setSessionName={setSessionName}
        customTargetDir={customTargetDir}
        setCustomTargetDir={setCustomTargetDir}
        copyMode={copyMode}
        setCopyMode={setCopyMode}
        cleanEmptyFolders={cleanEmptyFolders}
        setCleanEmptyFolders={setCleanEmptyFolders}
        isCreatingSet={isCreatingSet}
        isBrowsingTarget={isBrowsingTarget}
        handleBrowseTargetDir={handleBrowseTargetDir}
        handleCreateDjSet={handleCreateDjSet}
        djSetResult={djSetResult}
        setDjSetResult={setDjSetResult}
        selectedCount={selectedIds.size}
      />

      {/* Delete Confirmation Modal */}
      <DeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        isDeleting={isDeleting}
        deleteResult={deleteResult}
        setDeleteResult={setDeleteResult}
        selectedTracksList={selectedTracksList}
        selectedSizeBytes={selectedSizeBytes}
        handleDeleteTracks={handleDeleteTracks}
      />

      {/* Smart Reorder Modal */}
      <SmartReorderModal
        isOpen={isSmartReorderModalOpen}
        onClose={() => setIsSmartReorderModalOpen(false)}
        useBpm={useBpm}
        setUseBpm={setUseBpm}
        useKey={useKey}
        setUseKey={setUseKey}
        keyThreshold={keyThreshold}
        setKeyThreshold={setKeyThreshold}
        bpmCurve={bpmCurve}
        setBpmCurve={setBpmCurve}
        smartReorderPreview={smartReorderPreview}
        handleApplySmartReorder={handleApplySmartReorder}
        onOpenCamelotModal={() => setIsCamelotModalOpen(true)}
      />

      {/* Camelot Wheel Modal */}
      <CamelotWheelModal
        isOpen={isCamelotModalOpen}
        onClose={() => setIsCamelotModalOpen(false)}
        selectedKey={selectedCamelotKey}
      />

      {/* Save as Playlist Modal */}
      <ExportPlaylistModal
        isOpen={isExportPlaylistModalOpen}
        onClose={() => setIsExportPlaylistModalOpen(false)}
        exportPlaylistName={exportPlaylistName}
        setExportPlaylistName={setExportPlaylistName}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        exportUseRelativePaths={exportUseRelativePaths}
        setExportUseRelativePaths={setExportUseRelativePaths}
        exportIncludeHarmonicInfo={exportIncludeHarmonicInfo}
        setExportIncludeHarmonicInfo={setExportIncludeHarmonicInfo}
        exportScope={exportScope}
        setExportScope={setExportScope}
        selectedCount={selectedIds.size}
        totalCount={scanResult?.tracks.length || 0}
        handleDownloadPlaylist={handleDownloadPlaylist}
      />

      {/* Analyze BPM & Key Modal */}
      <AnalyzeModal
        isOpen={isAnalyzeModalOpen}
        onClose={() => setIsAnalyzeModalOpen(false)}
        analyzeScope={analyzeScope}
        setAnalyzeScope={setAnalyzeScope}
        analyzeWriteTags={analyzeWriteTags}
        setAnalyzeWriteTags={setAnalyzeWriteTags}
        isAnalyzing={isAnalyzing}
        analyzeProgress={analyzeProgress}
        analyzeLiveResults={analyzeLiveResults}
        analyzeResults={analyzeResults}
        missingCount={scanResult?.tracks.filter((t) => !t.bpm || !t.key).length || 0}
        totalCount={scanResult?.tracks.length || 0}
        selectedCount={selectedIds.size}
        handleStartAnalysis={handleStartAnalysis}
        handleCancelAnalysis={handleCancelAnalysis}
      />

      {/* Floating Audio Preview Player Bar */}
      <AudioPreviewBar
        playingTrack={playingTrack}
        isPlaying={isPlaying}
        playbackTime={playbackTime}
        playbackDuration={playbackDuration}
        volume={volume}
        isMuted={isMuted}
        handlePrevTrack={handlePrevTrack}
        handleTogglePlayPause={handleTogglePlayPause}
        handleNextTrack={handleNextTrack}
        handleSeek={handleSeek}
        handleVolumeChange={handleVolumeChange}
        handleToggleMute={handleToggleMute}
        handleClosePlayer={handleClosePlayer}
      />
    </div>
  );
};


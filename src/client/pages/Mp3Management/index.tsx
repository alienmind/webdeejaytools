import React, { useMemo, useState } from 'react';
import {
  FolderOpen,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Disc3,
  Layers,
  Music,
  Clock,
  HardDrive,
  CheckSquare,
  AlertTriangle,
  AlertOctagon,
  Trash2,
  MoveRight,
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
  ArrowRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  ListMusic,
  FileText,
  Download,
} from 'lucide-react';
import { AppSettings, LocalTrackItem } from '../../../shared/types.js';
import { api } from '../../services/api.js';
import {
  smartReorderTracks,
  formatCamelotKey,
  parseKeyToCamelot,
  SmartReorderResult,
} from '../../../shared/harmonic.js';
import { exportPlaylist, PlaylistExportFormat } from '../../../shared/playlistExporter.js';
import { CamelotWheelModal } from '../../components/CamelotWheelModal.js';
import { useToast } from '../../components/Toast.js';
import { TrackTable } from './components/TrackTable.js';
import { useLibrary } from './useLibrary.js';
import { useAudioPreview } from './useAudioPreview.js';
import { useAnalysis } from './useAnalysis.js';
import { useDjSets } from './useDjSets.js';
import { basename, formatBytes, formatDuration, formatTotalDuration } from './utils.js';

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
      {isDjModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-[#1e293b] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-fadeIn">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-glow-emerald">
                  <Disc3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">Create Flattened DJ Set</h3>
                  <p className="text-xs text-slate-400">Generate a unified session folder on disk</p>
                </div>
              </div>
              <button
                onClick={() => setIsDjModalOpen(false)}
                disabled={isCreatingSet}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Result View */}
            {djSetResult ? (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-400 text-sm">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>DJ Set Generated Successfully!</span>
                  </div>
                  <p>
                    Processed <strong>{djSetResult.processedCount}</strong> tracks into session folder:
                  </p>
                  <p className="p-2.5 rounded-lg bg-[#090d16] font-mono text-[11px] text-white select-all break-all border border-[#1e293b]">
                    {djSetResult.targetDirectory}
                  </p>
                  <p className="text-[11px] text-emerald-300">
                    Mode: {djSetResult.copyMode ? 'Copied non-destructively' : 'Moved and flattened physically on disk'}
                  </p>
                </div>

                {djSetResult.errors.length > 0 && (
                  <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs">
                    <p className="font-bold mb-1">Encountered {djSetResult.errors.length} issue(s):</p>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                      {djSetResult.errors.slice(0, 3).map((e, idx) => (
                        <li key={idx}>
                          {e.filePath}: {e.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    onClick={() => {
                      setIsDjModalOpen(false);
                      setDjSetResult(null);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all"
                  >
                    Done & Return to Library
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Session Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Session / Set Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="e.g. PeakTime_Techno_2026_08"
                    className="w-full px-4 py-2.5 bg-[#090d16] border border-[#1e293b] rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    A single flattened directory with this name will be created inside your Music Library.
                  </span>
                </div>

                {/* Target Directory Destination */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Target Destination Folder
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={
                        customTargetDir ||
                        `${(settings.defaultLibraryDir || scanPath).replace(/[\/\\]+$/, '')}\\${sessionName.trim()}`
                      }
                      onChange={(e) => setCustomTargetDir(e.target.value)}
                      placeholder="e.g. D:\MP3LIBRARY\Session_Name"
                      className="flex-1 px-4 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleBrowseTargetDir}
                      disabled={isBrowsingTarget}
                      className="px-3.5 py-2 rounded-xl bg-[#0e1626] hover:bg-slate-800 border border-[#1e293b] text-slate-300 text-xs font-semibold flex items-center gap-1.5 shrink-0"
                    >
                      <FolderOpen className="w-4 h-4 text-emerald-400" />
                      <span>Browse</span>
                    </button>
                  </div>
                </div>

                {/* Selected tracks recap */}
                <div className="p-3 rounded-xl bg-[#090d16] border border-[#1e293b] flex items-center justify-between text-xs">
                  <span className="text-slate-400">Tracks to Flatten:</span>
                  <span className="font-bold text-white font-mono">
                    {selectedIds.size} tracks ({formatBytes(selectedSizeBytes)})
                  </span>
                </div>

                {/* Mode Selection Checkbox (Move by default, copy optional) */}
                <div className="p-3.5 rounded-xl bg-[#0e1626] border border-emerald-950 space-y-2.5">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={copyMode}
                      onChange={(e) => setCopyMode(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-500 cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-white">Copy instead of move (non-destructive)</span>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        {copyMode ? (
                          <span className="text-teal-300">
                            Files will be duplicated to the destination folder. Original source files and folder structures will remain intact.
                          </span>
                        ) : (
                          <span className="text-amber-300">
                            ⚡ <strong>Move Mode (Default)</strong>: Audio files will be physically relocated into the target session folder. Subfolders (artist/album) are flattened.
                          </span>
                        )}
                      </p>
                    </div>
                  </label>

                  {!copyMode && (
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none pl-7 pt-1 border-t border-[#1e293b]/60">
                      <input
                        type="checkbox"
                        checked={cleanEmptyFolders}
                        onChange={(e) => setCleanEmptyFolders(e.target.checked)}
                        className="w-3.5 h-3.5 rounded accent-emerald-500"
                      />
                      <span>Clean up empty source folders after moving files</span>
                    </label>
                  )}
                </div>

                {/* Submit / Cancel Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1e293b]">
                  <button
                    type="button"
                    onClick={() => setIsDjModalOpen(false)}
                    disabled={isCreatingSet}
                    className="px-4 py-2.5 rounded-xl bg-[#090d16] hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateDjSet}
                    disabled={isCreatingSet || !sessionName.trim() || selectedIds.size === 0}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-glow-emerald flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isCreatingSet ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Flattening {selectedIds.size} Files...</span>
                      </>
                    ) : (
                      <>
                        <MoveRight className="w-4 h-4" />
                        <span>{copyMode ? 'Copy & Create Set' : 'Move & Create DJ Set'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Destructive Red Warning) */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#140b0e] border border-red-600/70 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-fadeIn">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-red-900/40 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-tr from-red-600 to-rose-600 text-white shadow-glow-red animate-pulse">
                  <AlertOctagon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base text-red-100">Permanently Delete Files?</h3>
                  <p className="text-xs text-red-400/80">Destructive operation • Physical removal from disk</p>
                </div>
              </div>
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Result View */}
            {deleteResult ? (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-xl bg-red-950/70 border border-red-700/60 text-red-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-red-300 text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span>Deleted {deleteResult.count} file(s) from disk</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    The files have been permanently deleted from storage and empty subfolders cleaned up.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setIsDeleteModalOpen(false);
                      setDeleteResult(null);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Red Warning Banner */}
                <div className="p-4 rounded-xl bg-red-950/80 border-2 border-red-600/80 text-red-200 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-black text-red-300 uppercase tracking-wide">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                    <span>Warning: Cannot Be Undone</span>
                  </div>
                  <p className="text-xs text-red-200/90 leading-relaxed">
                    You are about to permanently delete <strong className="text-white font-bold">{selectedTracksList.length} files</strong> ({formatBytes(selectedSizeBytes)}) from your hard disk.
                  </p>
                  <p className="text-[11px] text-red-300/80">
                    ⚠️ These files are <strong>NOT</strong> moved to the Recycle Bin / Trash. They will be immediately and permanently removed from disk storage.
                  </p>
                </div>

                {/* Track Preview Summary */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Files to be deleted:
                  </label>
                  <div className="max-h-40 overflow-y-auto bg-[#090d16] border border-red-950/80 rounded-xl p-2.5 space-y-1.5 divide-y divide-[#1e293b]/40">
                    {selectedTracksList.slice(0, 5).map((t) => (
                      <div key={t.id} className="pt-1.5 first:pt-0 flex items-center justify-between text-[11px]">
                        <div className="truncate max-w-[280px]">
                          <span className="font-bold text-slate-200">{t.artist}</span>
                          <span className="text-slate-400"> - {t.title}</span>
                          <p className="text-[10px] font-mono text-slate-500 truncate">{t.fileName}</p>
                        </div>
                        <span className="font-mono text-slate-400 shrink-0">{formatBytes(t.fileSize)}</span>
                      </div>
                    ))}
                    {selectedTracksList.length > 5 && (
                      <div className="pt-1.5 text-center text-[10px] text-slate-400 font-medium">
                        ...and {selectedTracksList.length - 5} more tracks
                      </div>
                    )}
                  </div>
                </div>

                {/* Submit / Cancel Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-red-950">
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(false)}
                    disabled={isDeleting}
                    className="px-4 py-2.5 rounded-xl bg-[#090d16] hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteTracks}
                    disabled={isDeleting || selectedTracksList.length === 0}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-xs font-bold shadow-glow-red flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Deleting {selectedTracksList.length} Files...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Delete {selectedTracksList.length} Files Permanently</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Smart Reorder Modal (Camelot Wheel Harmonic Mixing & BPM Waves) */}
      {isSmartReorderModalOpen && smartReorderPreview && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101424] border border-violet-700/60 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 animate-fadeIn max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-violet-950 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-glow-violet">
                  <Wand2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">Smart DJ Set Reorder</h3>
                  <p className="text-xs text-violet-300/80">Camelot Wheel harmonic mixing & dynamic BPM energy curves</p>
                </div>
              </div>
              <button
                onClick={() => setIsSmartReorderModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              {/* Configuration Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* 1. Key / Camelot Options */}
                <div className="p-4 rounded-xl bg-[#090d19] border border-violet-950/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useKey}
                        onChange={(e) => setUseKey(e.target.checked)}
                        className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500 accent-violet-500 cursor-pointer"
                      />
                      <span className="font-bold text-white text-xs flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5 text-violet-400" />
                        Use Key Info (Camelot Wheel)
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={() => setIsCamelotModalOpen(true)}
                      className="px-2 py-1 rounded-lg bg-violet-950/80 hover:bg-violet-900 border border-violet-700/60 text-violet-300 text-[10px] font-semibold flex items-center gap-1 transition-all"
                      title="Open visual Camelot Wheel diagram"
                    >
                      <Compass className="w-3 h-3 text-violet-400" />
                      <span>Chart</span>
                    </button>
                  </div>

                  {useKey && (
                    <div className="space-y-2 pt-1 border-t border-violet-950/60">
                      <label className="block text-[11px] font-semibold text-slate-300">
                        Max Harmonic Step Threshold:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-xs">
                        {[
                          { val: 0, label: '0 (Exact & Rel)', tip: 'Same key or Relative Maj/Min' },
                          { val: 1, label: '1 (Adjacent ±1)', tip: 'Smooth ±1 step (Recommended)' },
                          { val: 2, label: '2 (Energy Boost ±2)', tip: 'Allows ±2 step energy shifts' },
                        ].map((thresh) => (
                          <button
                            key={thresh.val}
                            type="button"
                            onClick={() => setKeyThreshold(thresh.val as any)}
                            className={`p-2 rounded-xl border text-center transition-all text-[11px] ${
                              keyThreshold === thresh.val
                                ? 'bg-violet-900/60 border-violet-500 text-violet-200 font-bold shadow-sm'
                                : 'bg-[#060810] border-[#1e293b] text-slate-400 hover:text-slate-200'
                            }`}
                            title={thresh.tip}
                          >
                            {thresh.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. BPM & Energy Options */}
                <div className="p-4 rounded-xl bg-[#090d19] border border-violet-950/80 space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={useBpm}
                      onChange={(e) => setUseBpm(e.target.checked)}
                      className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500 accent-violet-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-white text-xs flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-cyan-400" />
                        Use BPM Info
                      </span>
                    </div>
                  </label>

                  {useBpm && (
                    <div className="space-y-2 pt-1 border-t border-violet-950/60">
                      <label className="block text-[11px] font-semibold text-slate-300">
                        Energy Progression Curve:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setBpmCurve('wave')}
                          className={`p-2 rounded-xl border text-center transition-all text-[11px] ${
                            bpmCurve === 'wave'
                              ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200 font-bold shadow-sm'
                              : 'bg-[#060810] border-[#1e293b] text-slate-400 hover:text-slate-200'
                          }`}
                          title="Sinusoidal waves with build-ups and tension-release dips"
                        >
                          🌊 Dynamic Waves
                        </button>
                        <button
                          type="button"
                          onClick={() => setBpmCurve('ascending')}
                          className={`p-2 rounded-xl border text-center transition-all text-[11px] ${
                            bpmCurve === 'ascending'
                              ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200 font-bold shadow-sm'
                              : 'bg-[#060810] border-[#1e293b] text-slate-400 hover:text-slate-200'
                          }`}
                          title="Gradual steady tempo climb from lowest to highest"
                        >
                          📈 Ascending Ramp
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Set Health & Metrics Summary */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-violet-950/40 via-[#0e1428] to-cyan-950/40 border border-violet-900/50 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-slate-400">Harmonic Match:</span>
                    <strong className="text-emerald-300 font-mono">
                      {smartReorderPreview.stats.compatibilityRate}% Fit
                    </strong>
                  </div>
                  <div className="text-slate-600">|</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Avg BPM Delta:</span>
                    <strong className="text-cyan-300 font-mono">
                      ±{smartReorderPreview.stats.avgBpmDelta} BPM
                    </strong>
                  </div>
                </div>
                <span className="text-slate-400 font-mono text-[11px]">
                  {smartReorderPreview.tracks.length} tracks sequenced
                </span>
              </div>

              {/* Sequence Live Preview */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Optimized Track Sequence & Transitions:
                </label>
                <div className="bg-[#090d19] border border-violet-950/80 rounded-xl p-3 max-h-56 overflow-y-auto space-y-2 divide-y divide-[#1e293b]/40 font-sans">
                  {smartReorderPreview.tracks.map((track, idx) => {
                    const diag = smartReorderPreview.diagnostics[idx];
                    const camelot = parseKeyToCamelot(track.key);

                    return (
                      <div key={track.id} className="pt-2 first:pt-0 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate max-w-[340px]">
                            <span className="w-5 h-5 rounded-md bg-violet-950/80 border border-violet-800/60 text-violet-300 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-white truncate">{track.artist}</span>
                            <span className="text-slate-400 truncate">- {track.title}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {track.bpm && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800/40 text-amber-300 font-mono text-[10px] font-bold">
                                {track.bpm} BPM
                              </span>
                            )}
                            {camelot && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-800/40 text-purple-300 font-mono text-[10px] font-bold">
                                {formatCamelotKey(camelot)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Transition tag to next track */}
                        {diag && (
                          <div className="pl-7 flex items-center gap-2 text-[10px] font-mono text-slate-500">
                            <ArrowRight className="w-3 h-3 text-violet-400 shrink-0" />
                            <span
                              className={`px-1.5 py-0.2 rounded border ${
                                diag.transitionType === 'exact'
                                  ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                                  : diag.transitionType === 'relative'
                                  ? 'bg-teal-950/60 border-teal-700/60 text-teal-300'
                                  : diag.transitionType === 'adjacent'
                                  ? 'bg-cyan-950/60 border-cyan-700/60 text-cyan-300'
                                  : diag.transitionType === 'energy_boost'
                                  ? 'bg-amber-950/60 border-amber-700/60 text-amber-300'
                                  : 'bg-rose-950/60 border-rose-800/60 text-rose-300'
                              }`}
                            >
                              {diag.description}
                            </span>
                            {diag.bpmDiff !== undefined && (
                              <span className="text-slate-400">
                                ({diag.bpmDiff >= 0 ? `+${diag.bpmDiff}` : diag.bpmDiff} BPM)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-violet-950 shrink-0">
              <button
                type="button"
                onClick={() => setIsSmartReorderModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-[#090d19] hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplySmartReorder}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold shadow-glow-violet flex items-center gap-2 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>Apply Smart Order ({smartReorderPreview.tracks.length} Tracks)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camelot Wheel Modal */}
      <CamelotWheelModal
        isOpen={isCamelotModalOpen}
        onClose={() => setIsCamelotModalOpen(false)}
        selectedKey={selectedCamelotKey}
      />

      {/* Floating Audio Preview Player Bar */}
      {playingTrack && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#1e293b] bg-[#090d16]/95 p-3 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl animate-fadeIn sm:px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Track Info & Artwork */}
            <div className="flex w-full items-center gap-3 md:w-auto md:min-w-[240px]">
              <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-900 border border-[#1e293b] shrink-0 relative">
                {playingTrack.hasArtwork ? (
                  <img
                    src={api.getArtworkUrl(playingTrack.filePath)}
                    alt={playingTrack.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500">
                    <Music className="w-5 h-5" />
                  </div>
                )}
              </div>
              <div className="truncate max-w-[220px]">
                <h4 className="text-xs font-bold text-white truncate">{playingTrack.title}</h4>
                <p className="text-[11px] text-cyan-300 truncate">{playingTrack.artist}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {playingTrack.bpm && (
                    <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-950/80 px-1 rounded">
                      {playingTrack.bpm} BPM
                    </span>
                  )}
                  {playingTrack.key && (
                    <span className="text-[9px] font-mono font-bold text-purple-400 bg-purple-950/80 px-1 rounded">
                      {playingTrack.key}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Central Controls & Progress Bar */}
            <div className="flex-1 max-w-xl w-full flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePrevTrack}
                  className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                  title="Previous Track"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleTogglePlayPause}
                  className="w-9 h-9 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white flex items-center justify-center shadow-glow-emerald transition-all active:scale-95"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
                </button>
                <button
                  onClick={handleNextTrack}
                  className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                  title="Next Track"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>

              {/* Scrubbable Progress Bar */}
              <div className="w-full flex items-center gap-2 text-[10px] font-mono text-slate-400">
                <span>{formatDuration(playbackTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={playbackDuration || 100}
                  value={playbackTime}
                  onChange={(e) => handleSeek(parseFloat(e.target.value))}
                  className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <span>{formatDuration(playbackDuration)}</span>
              </div>
            </div>

            {/* Volume & Close */}
            <div className="hidden items-center justify-end gap-3 md:flex md:min-w-[200px]">
              <button
                onClick={handleToggleMute}
                className="text-slate-400 hover:text-white transition-all"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-slate-300" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <button
                onClick={handleClosePlayer}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-all ml-2"
                title="Close Player"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save as Playlist Modal */}
      {isExportPlaylistModalOpen && scanResult && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c1020] border border-sky-600/70 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-fadeIn max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-sky-950/80 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-sky-600 to-blue-600 text-white shadow-glow-blue">
                  <ListMusic className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">Save / Export Playlist</h3>
                  <p className="text-xs text-sky-300/80">Universal playlist formats for Pioneer Rekordbox, Serato, Traktor, Engine DJ & more</p>
                </div>
              </div>
              <button
                onClick={() => setIsExportPlaylistModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
              {/* Playlist Name Input */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Playlist Name:
                </label>
                <input
                  type="text"
                  value={exportPlaylistName}
                  onChange={(e) => setExportPlaylistName(e.target.value)}
                  placeholder="e.g. Ibiza_Sunset_Set"
                  className="w-full px-3.5 py-2.5 bg-[#070a14] border border-sky-950 focus:border-sky-500 rounded-xl text-white font-medium focus:outline-none"
                />
              </div>

              {/* Scope Selection */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Tracks to Export:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportScope('all')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      exportScope === 'all'
                        ? 'bg-sky-950/70 border-sky-500 text-sky-200 font-bold'
                        : 'bg-[#070a14] border-[#1e293b] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div>All Scanned Tracks</div>
                    <div className="text-[10px] text-slate-500">{scanResult.tracks.length} tracks</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportScope('selected')}
                    disabled={selectedIds.size === 0}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      exportScope === 'selected'
                        ? 'bg-sky-950/70 border-sky-500 text-sky-200 font-bold'
                        : 'bg-[#070a14] border-[#1e293b] text-slate-400 hover:text-slate-200 disabled:opacity-40'
                    }`}
                  >
                    <div>Selected Tracks Only</div>
                    <div className="text-[10px] text-slate-500">{selectedIds.size} tracks selected</div>
                  </button>
                </div>
              </div>

              {/* Format Selection Grid */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Playlist Format (DJ Software Compatibility):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      id: 'm3u8',
                      name: 'Extended M3U8 (.m3u8)',
                      desc: 'Universal standard: Rekordbox, Serato, Traktor, Engine DJ, VirtualDJ',
                      badge: 'Recommended',
                    },
                    {
                      id: 'm3u',
                      name: 'Standard M3U (.m3u)',
                      desc: 'Standard audio playlist file for legacy media players',
                    },
                    {
                      id: 'rekordbox_xml',
                      name: 'Pioneer Rekordbox XML (.xml)',
                      desc: 'Full Rekordbox collection bridge with BPM & tonality tags',
                    },
                    {
                      id: 'csv',
                      name: 'Spreadsheet CSV (.csv)',
                      desc: 'Tracklist table with BPM, Key & metadata for Excel',
                    },
                    {
                      id: 'txt',
                      name: 'DJ Tracklist (.txt)',
                      desc: 'Formatted text list for 1001Tracklists & Mixcloud',
                    },
                    {
                      id: 'json',
                      name: 'JSON File (.json)',
                      desc: 'Raw machine-readable tracklist object',
                    },
                  ].map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setExportFormat(fmt.id as PlaylistExportFormat)}
                      className={`p-2.5 rounded-xl border text-left transition-all relative ${
                        exportFormat === fmt.id
                          ? 'bg-sky-950/70 border-sky-500 text-sky-200 shadow-sm'
                          : 'bg-[#070a14] border-[#1e293b] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {fmt.badge && (
                        <span className="absolute top-2 right-2 px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold">
                          {fmt.badge}
                        </span>
                      )}
                      <div className="font-bold text-xs text-white flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-sky-400" />
                        <span>{fmt.name}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 leading-tight">{fmt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Options Checkboxes */}
              <div className="p-3 rounded-xl bg-[#070a14] border border-sky-950/80 space-y-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={exportUseRelativePaths}
                    onChange={(e) => setExportUseRelativePaths(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 accent-sky-500 cursor-pointer"
                  />
                  <div>
                    <span className="font-semibold text-white">Use Relative Paths</span>
                    <p className="text-[10px] text-slate-400">
                      Recommended for USB flash drives and moving playlists together with music files.
                    </p>
                  </div>
                </label>

                {(exportFormat === 'm3u8' || exportFormat === 'm3u') && (
                  <label className="flex items-center gap-2 cursor-pointer select-none pt-1 border-t border-sky-950/50">
                    <input
                      type="checkbox"
                      checked={exportIncludeHarmonicInfo}
                      onChange={(e) => setExportIncludeHarmonicInfo(e.target.checked)}
                      className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 accent-sky-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-semibold text-white">Include Camelot Key & BPM in track titles</span>
                      <p className="text-[10px] text-slate-400">
                        Adds e.g. <code className="text-sky-300 font-mono">[8A | 128 BPM]</code> to the M3U #EXTINF header.
                      </p>
                    </div>
                  </label>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-sky-950/80 shrink-0">
              <button
                type="button"
                onClick={() => setIsExportPlaylistModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-[#070a14] hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDownloadPlaylist}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-bold shadow-glow-blue flex items-center gap-2 transition-all active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>
                  Download {exportFormat.toUpperCase()} Playlist (
                  {exportScope === 'selected' ? selectedIds.size : scanResult.tracks.length} tracks)
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analyze BPM & Key Modal */}
      {isAnalyzeModalOpen && scanResult && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#120f1a] border border-amber-600/60 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 animate-fadeIn max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-amber-950/80 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-600 text-white shadow-glow-amber">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">Analyze BPM & Camelot Key</h3>
                  <p className="text-xs text-amber-300/80">
                    DSP Engine: Low-pass Autocorrelation (BPM) + 12-bin Krumhansl-Schmuckler Chromagram (Key)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAnalyzeModalOpen(false)}
                disabled={isAnalyzing}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
              {/* Scope Selection */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Tracks to Analyze:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => setAnalyzeScope('missing')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      analyzeScope === 'missing'
                        ? 'bg-amber-950/70 border-amber-500 text-amber-200 font-bold'
                        : 'bg-[#09070f] border-[#221c30] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div>Missing Info Only</div>
                    <div className="text-[10px] text-slate-500">
                      {scanResult.tracks.filter((t) => !t.bpm || !t.key).length} tracks need analysis
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => setAnalyzeScope('all')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      analyzeScope === 'all'
                        ? 'bg-amber-950/70 border-amber-500 text-amber-200 font-bold'
                        : 'bg-[#09070f] border-[#221c30] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div>All Scanned Tracks</div>
                    <div className="text-[10px] text-slate-500">{scanResult.tracks.length} tracks total</div>
                  </button>

                  <button
                    type="button"
                    disabled={isAnalyzing || selectedIds.size === 0}
                    onClick={() => setAnalyzeScope('selected')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      analyzeScope === 'selected'
                        ? 'bg-amber-950/70 border-amber-500 text-amber-200 font-bold'
                        : 'bg-[#09070f] border-[#221c30] text-slate-400 hover:text-slate-200 disabled:opacity-40'
                    }`}
                  >
                    <div>Selected Tracks Only</div>
                    <div className="text-[10px] text-slate-500">{selectedIds.size} tracks selected</div>
                  </button>
                </div>
              </div>

              {/* Tag Persistence Options */}
              <div className="p-3.5 rounded-2xl bg-[#09070f] border border-amber-950/80 space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    disabled={isAnalyzing}
                    checked={analyzeWriteTags}
                    onChange={(e) => setAnalyzeWriteTags(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-500 cursor-pointer"
                  />
                  <div>
                    <span className="font-semibold text-white">Write detected BPM & Key to audio file tags (ID3/FLAC)</span>
                    <p className="text-[10px] text-slate-400">
                      Permanently saves <code className="text-amber-300 font-mono">TBPM</code> and <code className="text-purple-300 font-mono">TKEY</code> metadata frames into the audio files on disk.
                    </p>
                  </div>
                </label>
              </div>

              {/* In-Progress Progress Bar & Live Counter */}
              {isAnalyzing && analyzeProgress && (
                <div className="p-4 rounded-2xl bg-[#09070f] border border-amber-600/50 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-200">
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                      <span>
                        Analyzing track {analyzeProgress.current} of {analyzeProgress.total}
                      </span>
                    </span>
                    <span className="font-mono text-amber-300 font-black text-sm">
                      {analyzeProgress.percent}%
                    </span>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="w-full h-3 bg-[#181124] rounded-full overflow-hidden border border-amber-950 p-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 transition-all duration-300 rounded-full shadow-glow-amber"
                      style={{ width: `${Math.max(3, analyzeProgress.percent)}%` }}
                    />
                  </div>

                  {analyzeProgress.currentFileName && (
                    <p className="text-[11px] text-slate-300 truncate font-mono flex items-center gap-1.5">
                      <span className="text-amber-400 font-semibold">Active:</span>
                      <span className="truncate">{analyzeProgress.currentFileName}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Real-time Streaming & Completed Results Table */}
              {(analyzeLiveResults.length > 0 || analyzeResults) && (
                <div className="space-y-2 pt-2 border-t border-amber-950/60">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs flex items-center gap-1.5">
                      {isAnalyzing ? (
                        <>
                          <Activity className="w-4 h-4 text-amber-400 animate-pulse" />
                          <span>
                            Live Results Stream ({analyzeLiveResults.length} tracks analyzed...)
                          </span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>
                            Analysis Completed (
                            {(analyzeResults || analyzeLiveResults).filter((r) => r.bpm && r.camelotKey).length} of{' '}
                            {(analyzeResults || analyzeLiveResults).length} tracks detected)
                          </span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="max-h-60 overflow-y-auto rounded-xl border border-[#221c30] bg-[#09070f] divide-y divide-[#1b1526]">
                    {(analyzeResults || analyzeLiveResults).map((res, idx) => {
                      const fileName = res.filePath.split(/[/\\]/).pop() || res.filePath;
                      return (
                        <div
                          key={idx}
                          className="p-2.5 px-3 flex items-center justify-between text-xs hover:bg-[#140f21] transition-all"
                        >
                          <div className="truncate max-w-[280px]">
                            <span className="font-medium text-slate-200 truncate block">{fileName}</span>
                            {res.error && <span className="text-[10px] text-red-400">{res.error}</span>}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {res.bpm ? (
                              <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-700/60 text-amber-300 font-mono font-bold text-[11px]">
                                {res.bpm} BPM
                              </span>
                            ) : (
                              <span className="text-slate-600 font-mono text-[10px]">-- BPM</span>
                            )}

                            {res.camelotKey ? (
                              <span className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-700/60 text-purple-300 font-mono font-bold text-[11px]">
                                {res.camelotKey} ({res.key})
                              </span>
                            ) : (
                              <span className="text-slate-600 font-mono text-[10px]">-- Key</span>
                            )}

                            {res.tagsWritten && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[9px] font-bold">
                                Tagged
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-amber-950/80 shrink-0">
              <button
                type="button"
                disabled={isAnalyzing}
                onClick={() => setIsAnalyzeModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-[#09070f] hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all disabled:opacity-40"
              >
                {analyzeResults ? 'Close' : 'Cancel'}
              </button>
              {!analyzeResults && (
                <button
                  type="button"
                  disabled={isAnalyzing}
                  onClick={handleStartAnalysis}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-glow-amber flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>
                        Start DSP Analysis (
                        {analyzeScope === 'selected'
                          ? selectedIds.size
                          : analyzeScope === 'missing'
                          ? scanResult.tracks.filter((t) => !t.bpm || !t.key).length
                          : scanResult.tracks.length}{' '}
                        Tracks)
                      </span>
                    </>
                  )}
                </button>
              )}

              {isAnalyzing && (
                <button
                  onClick={handleCancelAnalysis}
                  className="w-full rounded-xl border border-red-700/60 bg-red-950/60 px-5 py-3 text-xs font-bold text-red-200 transition-all hover:bg-red-900/60 sm:w-auto"
                >
                  Cancel analysis
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


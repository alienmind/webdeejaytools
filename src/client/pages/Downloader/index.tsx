import React, { useState, useEffect } from 'react';
import {
  Download,
  Disc,
  FileAudio,
  CheckCircle2,
  AlertCircle,
  Trash2,
  RefreshCw,
  Sparkles,
  HardDrive,
  FolderOpen,
} from 'lucide-react';
import { AppSettings, DownloadItemProgress, QualityId, TrackItem } from '../../../shared/types.js';
import { api } from '../../services/api.js';

interface DownloaderPageProps {
  settings: AppSettings;
  queue: DownloadItemProgress[];
}

export const DownloaderPage: React.FC<DownloaderPageProps> = ({ settings, queue }) => {
  const [url, setUrl] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{
    type: 'track' | 'album' | 'playlist';
    title: string;
    artist?: string;
    coverUrl?: string;
    tracks: TrackItem[];
  } | null>(null);

  const [selectedQuality, setSelectedQuality] = useState<QualityId>(settings.defaultQuality || 6);
  const [downloadDir, setDownloadDir] = useState<string>(settings.defaultDownloadDir || '');
  const [createM3u, setCreateM3u] = useState<boolean>(settings.createM3u ?? true);
  const [enqueuing, setEnqueuing] = useState(false);
  const [isBrowsingDir, setIsBrowsingDir] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBrowseDir = async () => {
    try {
      setIsBrowsingDir(true);
      const res = await api.browseDirectory(downloadDir);
      if (!res.canceled && res.path) {
        setDownloadDir(res.path);
      }
    } catch (err) {
      console.error('Failed to open directory browser:', err);
    } finally {
      setIsBrowsingDir(false);
    }
  };

  useEffect(() => {
    if (settings.defaultQuality) setSelectedQuality(settings.defaultQuality);
    if (settings.defaultDownloadDir) setDownloadDir(settings.defaultDownloadDir);
    if (settings.createM3u !== undefined) setCreateM3u(settings.createM3u);
  }, [settings]);

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setError(null);
    setLoadingPreview(true);
    setPreviewData(null);

    try {
      const data = await api.previewDownloadUrl(url.trim());
      setPreviewData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to preview Qobuz URL');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleEnqueue = async () => {
    if (!previewData || previewData.tracks.length === 0) return;

    setError(null);
    setEnqueuing(true);

    try {
      await api.enqueueDownloads(
        previewData.tracks,
        selectedQuality,
        downloadDir,
        previewData.title,
        createM3u
      );
      setPreviewData(null);
      setUrl('');
    } catch (err: any) {
      setError(err.message || 'Failed to enqueue downloads');
    } finally {
      setEnqueuing(false);
    }
  };

  const handleClearCompleted = async () => {
    try {
      await api.clearCompletedDownloads();
    } catch (err: any) {
      console.error('Failed to clear completed items:', err);
    }
  };

  const formatSpeed = (bps?: number) => {
    if (!bps || bps <= 0) return '';
    if (bps > 1024 * 1024) {
      return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    return `${(bps / 1024).toFixed(0)} KB/s`;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-3">
            <span className="p-2 rounded-xl bg-purple-950/80 border border-purple-700/50 text-purple-400">
              <Download className="w-6 h-6" />
            </span>
            <span>Audio Downloader</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Download lossless audio and high-bitrate tracks with embedded metadata, cover art & M3U playlist generation.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-200 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* URL Input & Options */}
      <section className="bg-[#111827] border border-[#1e293b] rounded-2xl p-6 shadow-xl space-y-6">
        <form onSubmit={handlePreview} className="flex gap-3">
          <input
            type="text"
            placeholder="Paste track, album, or playlist URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 px-4 py-3 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-mono"
          />
          <button
            type="submit"
            disabled={loadingPreview || !url.trim()}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-sm font-semibold rounded-xl transition-all shadow-glow-purple disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
          >
            {loadingPreview ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Resolving...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Resolve Audio</span>
              </>
            )}
          </button>
        </form>

        {previewData && (
          <div className="p-4 rounded-xl bg-[#090d16] border border-[#1e293b] flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-4">
              {previewData.coverUrl ? (
                <img src={previewData.coverUrl} alt="Cover" className="w-16 h-16 rounded-lg object-cover border border-[#1e293b]" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center">
                  <Disc className="w-8 h-8 text-slate-500" />
                </div>
              )}
              <div>
                <span className="text-xs text-slate-400 uppercase font-mono">{previewData.type}</span>
                <h4 className="text-base font-bold text-white mt-0.5">{previewData.title}</h4>
                {previewData.artist && <p className="text-xs text-slate-400">{previewData.artist}</p>}
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl font-mono font-bold text-purple-400">{previewData.tracks.length}</span>
              <p className="text-xs text-slate-400">tracks ready</p>
            </div>
          </div>
        )}

        {/* Quality & Download Settings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-[#1e293b]">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Audio Quality Format</label>
            <select
              value={selectedQuality}
              onChange={(e) => setSelectedQuality(Number(e.target.value) as QualityId)}
              className="w-full px-3 py-2.5 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
            >
              <option value={5}>MP3 320 kbps (Quality 5)</option>
              <option value={6}>FLAC 16-bit / 44.1 kHz CD Quality (Quality 6)</option>
              <option value={7}>FLAC 24-bit / up to 96 kHz Hi-Res (Quality 7)</option>
              <option value={27}>FLAC 24-bit / up to 192 kHz Hi-Res (Quality 27)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Destination Directory</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={downloadDir}
                onChange={(e) => setDownloadDir(e.target.value)}
                className="flex-1 px-3 py-2.5 bg-[#090d16] border border-[#1e293b] rounded-xl text-xs text-white focus:outline-none focus:border-purple-500 font-mono truncate"
                placeholder="e.g. ./downloads"
              />
              <button
                type="button"
                onClick={handleBrowseDir}
                disabled={isBrowsingDir}
                className="px-3 py-2.5 rounded-xl bg-[#0e1626] hover:bg-purple-950/80 border border-purple-800/60 text-purple-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shrink-0 disabled:opacity-50"
                title="Browse folder visually"
              >
                <FolderOpen className="w-4 h-4 text-purple-400" />
                <span>{isBrowsingDir ? '...' : 'Browse'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none py-2.5">
              <input
                type="checkbox"
                checked={createM3u}
                onChange={(e) => setCreateM3u(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-0"
              />
              <span>Generate .m3u Extended Playlist</span>
            </label>
          </div>
        </div>

        {previewData && (
          <div className="flex justify-end pt-2">
            <button
              onClick={handleEnqueue}
              disabled={enqueuing}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm transition-all shadow-glow-purple flex items-center gap-2"
            >
              {enqueuing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Enqueuing...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download {previewData.tracks.length} Tracks</span>
                </>
              )}
            </button>
          </div>
        )}
      </section>

      {/* Live Download Queue */}
      <section className="bg-[#111827] border border-[#1e293b] rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
          <div className="flex items-center gap-3">
            <FileAudio className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-white">Active Download Queue</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {queue.length} items
            </span>
          </div>

          {queue.length > 0 && (
            <button
              onClick={handleClearCompleted}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-rose-400 bg-slate-800/80 hover:bg-rose-950/40 border border-[#1e293b] rounded-lg transition-all flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Completed</span>
            </button>
          )}
        </div>

        {queue.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            <HardDrive className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>No downloads in queue</p>
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map((item) => {
              const isDownloading = item.status === 'downloading';
              const isTagging = item.status === 'tagging';
              const isCompleted = item.status === 'completed';
              const isFailed = item.status === 'failed';

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-xl bg-[#090d16] border border-[#1e293b] space-y-2.5 transition-all hover:border-slate-700"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3 overflow-hidden">
                      {item.track.coverUrl ? (
                        <img src={item.track.coverUrl} alt="Art" className="w-9 h-9 rounded object-cover shrink-0 border border-[#1e293b]" />
                      ) : (
                        <div className="w-9 h-9 rounded bg-slate-800 flex items-center justify-center shrink-0">
                          <Disc className="w-5 h-5 text-slate-500" />
                        </div>
                      )}
                      <div className="truncate">
                        <div className="font-semibold text-white truncate">{item.track.title}</div>
                        <div className="text-slate-400 truncate">{item.track.artist} • {item.track.album}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 font-mono">
                      {isDownloading && (
                        <span className="text-purple-400 font-bold">
                          {formatSpeed(item.speedBps)}
                        </span>
                      )}

                      {isCompleted && (
                        <span className="flex items-center gap-1 text-emerald-400 font-bold">
                          <CheckCircle2 className="w-4 h-4" />
                          Complete
                        </span>
                      )}

                      {isTagging && (
                        <span className="flex items-center gap-1 text-cyan-400 font-bold animate-pulse">
                          <Sparkles className="w-4 h-4" />
                          Tagging Metadata...
                        </span>
                      )}

                      {isFailed && (
                        <span className="flex items-center gap-1 text-rose-400 font-bold">
                          <AlertCircle className="w-4 h-4" />
                          Failed
                        </span>
                      )}

                      {item.status === 'queued' && (
                        <span className="text-slate-500">Queued</span>
                      )}

                      <span className="w-12 text-right font-bold text-slate-300">
                        {item.progressPercent}%
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 rounded-full ${
                        isCompleted
                          ? 'bg-emerald-500'
                          : isFailed
                          ? 'bg-rose-500'
                          : isTagging
                          ? 'bg-cyan-400'
                          : 'bg-gradient-to-r from-purple-500 to-pink-500'
                      }`}
                      style={{ width: `${item.progressPercent}%` }}
                    />
                  </div>

                  {item.error && (
                    <div className="text-[11px] text-rose-400 font-mono">Error: {item.error}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

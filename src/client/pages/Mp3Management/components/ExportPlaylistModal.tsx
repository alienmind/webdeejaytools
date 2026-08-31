import React from 'react';
import { ListMusic, FileText, Download, X } from 'lucide-react';
import { PlaylistExportFormat } from '../../../../shared/playlistExporter.js';

interface ExportPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportPlaylistName: string;
  setExportPlaylistName: (name: string) => void;
  exportFormat: PlaylistExportFormat;
  setExportFormat: (fmt: PlaylistExportFormat) => void;
  exportUseRelativePaths: boolean;
  setExportUseRelativePaths: (rel: boolean) => void;
  exportIncludeHarmonicInfo: boolean;
  setExportIncludeHarmonicInfo: (inc: boolean) => void;
  exportScope: 'all' | 'selected';
  setExportScope: (scope: 'all' | 'selected') => void;
  selectedCount: number;
  totalCount: number;
  handleDownloadPlaylist: () => void;
}

export const ExportPlaylistModal: React.FC<ExportPlaylistModalProps> = ({
  isOpen,
  onClose,
  exportPlaylistName,
  setExportPlaylistName,
  exportFormat,
  setExportFormat,
  exportUseRelativePaths,
  setExportUseRelativePaths,
  exportIncludeHarmonicInfo,
  setExportIncludeHarmonicInfo,
  exportScope,
  setExportScope,
  selectedCount,
  totalCount,
  handleDownloadPlaylist,
}) => {
  if (!isOpen) return null;

  return (
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
            onClick={onClose}
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
                <div className="text-[10px] text-slate-500">{totalCount} tracks</div>
              </button>

              <button
                type="button"
                onClick={() => setExportScope('selected')}
                disabled={selectedCount === 0}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  exportScope === 'selected'
                    ? 'bg-sky-950/70 border-sky-500 text-sky-200 font-bold'
                    : 'bg-[#070a14] border-[#1e293b] text-slate-400 hover:text-slate-200 disabled:opacity-40'
                }`}
              >
                <div>Selected Tracks Only</div>
                <div className="text-[10px] text-slate-500">{selectedCount} tracks selected</div>
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
            onClick={onClose}
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
              {exportScope === 'selected' ? selectedCount : totalCount} tracks)
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

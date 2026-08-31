import React from 'react';
import {
  Activity,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { AudioAnalysisResult } from '../../../../shared/types.js';

interface AnalyzeProgressInfo {
  current: number;
  total: number;
  percent: number;
  currentFileName?: string;
}

interface AnalyzeModalProps {
  isOpen: boolean;
  onClose: () => void;
  analyzeScope: 'missing' | 'all' | 'selected';
  setAnalyzeScope: (scope: 'missing' | 'all' | 'selected') => void;
  analyzeWriteTags: boolean;
  setAnalyzeWriteTags: (write: boolean) => void;
  isAnalyzing: boolean;
  analyzeProgress: AnalyzeProgressInfo | null;
  analyzeLiveResults: AudioAnalysisResult[];
  analyzeResults: AudioAnalysisResult[] | null;
  missingCount: number;
  totalCount: number;
  selectedCount: number;
  handleStartAnalysis: () => void;
  handleCancelAnalysis: () => void;
}

export const AnalyzeModal: React.FC<AnalyzeModalProps> = ({
  isOpen,
  onClose,
  analyzeScope,
  setAnalyzeScope,
  analyzeWriteTags,
  setAnalyzeWriteTags,
  isAnalyzing,
  analyzeProgress,
  analyzeLiveResults,
  analyzeResults,
  missingCount,
  totalCount,
  selectedCount,
  handleStartAnalysis,
  handleCancelAnalysis,
}) => {
  if (!isOpen) return null;

  return (
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
            onClick={onClose}
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
                  {missingCount} tracks need analysis
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
                <div className="text-[10px] text-slate-500">{totalCount} tracks total</div>
              </button>

              <button
                type="button"
                disabled={isAnalyzing || selectedCount === 0}
                onClick={() => setAnalyzeScope('selected')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  analyzeScope === 'selected'
                    ? 'bg-amber-950/70 border-amber-500 text-amber-200 font-bold'
                    : 'bg-[#09070f] border-[#221c30] text-slate-400 hover:text-slate-200 disabled:opacity-40'
                }`}
              >
                <div>Selected Tracks Only</div>
                <div className="text-[10px] text-slate-500">{selectedCount} tracks selected</div>
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
            onClick={onClose}
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
                      ? selectedCount
                      : analyzeScope === 'missing'
                      ? missingCount
                      : totalCount}{' '}
                    Tracks)
                  </span>
                </>
              )}
            </button>
          )}

          {isAnalyzing && (
            <button
              type="button"
              onClick={handleCancelAnalysis}
              className="w-full rounded-xl border border-red-700/60 bg-red-950/60 px-5 py-3 text-xs font-bold text-red-200 transition-all hover:bg-red-900/60 sm:w-auto"
            >
              Cancel analysis
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

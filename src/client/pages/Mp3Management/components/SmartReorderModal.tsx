import React from 'react';
import {
  Wand2,
  Compass,
  Activity,
  ArrowRight,
  Sparkles,
  X,
} from 'lucide-react';
import {
  formatCamelotKey,
  parseKeyToCamelot,
  SmartReorderResult,
} from '../../../../shared/harmonic.js';

interface SmartReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  useBpm: boolean;
  setUseBpm: (use: boolean) => void;
  useKey: boolean;
  setUseKey: (use: boolean) => void;
  keyThreshold: 0 | 1 | 2;
  setKeyThreshold: (threshold: 0 | 1 | 2) => void;
  bpmCurve: 'wave' | 'ascending';
  setBpmCurve: (curve: 'wave' | 'ascending') => void;
  smartReorderPreview: SmartReorderResult | null;
  handleApplySmartReorder: () => void;
  onOpenCamelotModal: () => void;
}

export const SmartReorderModal: React.FC<SmartReorderModalProps> = ({
  isOpen,
  onClose,
  useBpm,
  setUseBpm,
  useKey,
  setUseKey,
  keyThreshold,
  setKeyThreshold,
  bpmCurve,
  setBpmCurve,
  smartReorderPreview,
  handleApplySmartReorder,
  onOpenCamelotModal,
}) => {
  if (!isOpen || !smartReorderPreview) return null;

  return (
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
            onClick={onClose}
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
                  onClick={onOpenCamelotModal}
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
                        onClick={() => setKeyThreshold(thresh.val as 0 | 1 | 2)}
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
            onClick={onClose}
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
  );
};

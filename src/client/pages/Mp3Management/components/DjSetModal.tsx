import React from 'react';
import { Disc3, FolderOpen, RefreshCw, MoveRight, CheckCircle2, X } from 'lucide-react';
import { CreateDjSetResult } from '../../../../shared/types.js';

interface DjSetModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionName: string;
  setSessionName: (name: string) => void;
  customTargetDir: string;
  setCustomTargetDir: (dir: string) => void;
  copyMode: boolean;
  setCopyMode: (copy: boolean) => void;
  cleanEmptyFolders: boolean;
  setCleanEmptyFolders: (clean: boolean) => void;
  isCreatingSet: boolean;
  isBrowsingTarget: boolean;
  handleBrowseTargetDir: () => void;
  handleCreateDjSet: () => void;
  djSetResult: CreateDjSetResult | null;
  setDjSetResult: (res: CreateDjSetResult | null) => void;
  selectedCount: number;
}

export const DjSetModal: React.FC<DjSetModalProps> = ({
  isOpen,
  onClose,
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
  handleBrowseTargetDir,
  handleCreateDjSet,
  djSetResult,
  setDjSetResult,
  selectedCount,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#111827] border border-[#1e293b] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-fadeIn">
        {/* Header */}
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
            onClick={onClose}
            disabled={isCreatingSet}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Result View */}
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
                  onClose();
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
            {/* Session Name Input */}
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
                  value={customTargetDir}
                  onChange={(e) => setCustomTargetDir(e.target.value)}
                  placeholder="e.g. D:\MP3LIBRARY\Session_Name"
                  className="flex-1 px-4 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={handleBrowseTargetDir}
                  disabled={isBrowsingTarget || isCreatingSet}
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
                {selectedCount} tracks
              </span>
            </div>

            {/* Mode Selection Checkbox */}
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
                onClick={onClose}
                disabled={isCreatingSet}
                className="px-4 py-2.5 rounded-xl bg-[#090d16] hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateDjSet}
                disabled={isCreatingSet || !sessionName.trim() || selectedCount === 0}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-glow-emerald flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {isCreatingSet ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Flattening {selectedCount} Files...</span>
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
  );
};

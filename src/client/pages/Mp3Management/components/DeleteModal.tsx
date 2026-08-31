import React from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, RefreshCw, Trash2, X } from 'lucide-react';
import { LocalTrackItem } from '../../../../shared/types.js';
import { formatBytes } from '../utils.js';

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDeleting: boolean;
  deleteResult: {
    success: boolean;
    count: number;
    errors: { filePath: string; error: string }[];
  } | null;
  setDeleteResult: (
    res: {
      success: boolean;
      count: number;
      errors: { filePath: string; error: string }[];
    } | null
  ) => void;
  selectedTracksList: LocalTrackItem[];
  selectedSizeBytes: number;
  handleDeleteTracks: () => void;
}

export const DeleteModal: React.FC<DeleteModalProps> = ({
  isOpen,
  onClose,
  isDeleting,
  deleteResult,
  setDeleteResult,
  selectedTracksList,
  selectedSizeBytes,
  handleDeleteTracks,
}) => {
  if (!isOpen) return null;

  return (
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
            onClick={onClose}
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
                  onClose();
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
                onClick={onClose}
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
  );
};

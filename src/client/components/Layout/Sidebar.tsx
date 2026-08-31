import { ArrowLeftRight, Download, Settings, Disc3, ShieldCheck, AlertCircle, ListMusic } from 'lucide-react';
import { Account } from '../../../shared/types.js';

export type ActiveTab = 'converter' | 'downloader' | 'mp3' | 'admin';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  accounts: Account[];
  activeDownloadCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  accounts,
  activeDownloadCount,
}) => {
  const activeQobuz = accounts.find((a) => a.service === 'qobuz' && a.isActive);
  const activeSpotify = accounts.find((a) => a.service === 'spotify' && a.isActive);

  return (
    <aside className="w-64 h-screen bg-[#0d1322] border-r border-[#1e293b] flex flex-col justify-between select-none shrink-0">
      {/* Top Header */}
      <div>
        <div className="p-6 border-b border-[#1e293b] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center shadow-glow-cyan animate-pulse">
            <Disc3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
              <span>WebDeeJay</span>
              <span className="text-cyan-400 font-mono text-xs px-1.5 py-0.5 bg-cyan-950/70 border border-cyan-800/60 rounded">TOOLS</span>
            </h1>
            <p className="text-xs text-slate-400">DJ Automation Suite</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-4 space-y-1.5">
          <button
            onClick={() => setActiveTab('converter')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'converter'
                ? 'bg-gradient-to-r from-cyan-950/80 to-blue-950/40 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#161f30]'
            }`}
          >
            <div className="flex items-center gap-3">
              <ArrowLeftRight className={`w-5 h-5 ${activeTab === 'converter' ? 'text-cyan-400' : 'text-slate-400'}`} />
              <span>Playlist Converter</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('downloader')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'downloader'
                ? 'bg-gradient-to-r from-purple-950/80 to-pink-950/40 text-purple-300 border border-purple-500/40 shadow-glow-purple'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#161f30]'
            }`}
          >
            <div className="flex items-center gap-3">
              <Download className={`w-5 h-5 ${activeTab === 'downloader' ? 'text-purple-400' : 'text-slate-400'}`} />
              <span>Audio Downloader</span>
            </div>
            {activeDownloadCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-500 text-white animate-bounce">
                {activeDownloadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('mp3')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'mp3'
                ? 'bg-gradient-to-r from-emerald-950/80 to-teal-950/40 text-emerald-300 border border-emerald-500/40 shadow-glow-emerald'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#161f30]'
            }`}
          >
            <div className="flex items-center gap-3">
              <ListMusic className={`w-5 h-5 ${activeTab === 'mp3' ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>MP3 Management</span>
            </div>
          </button>
        </nav>
      </div>

      {/* Footer & Admin Link (Pinned to bottom) */}
      <div className="p-4 border-t border-[#1e293b] space-y-3">
        {/* Service Status Badges */}
        <div className="bg-[#111827] p-3 rounded-xl border border-[#1e293b] space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Qobuz:
            </span>
            {activeQobuz ? (
              <span className="text-emerald-400 flex items-center gap-1 font-mono text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5" />
                {activeQobuz.label}
              </span>
            ) : (
              <span className="text-amber-500/80 flex items-center gap-1 text-[11px]">
                <AlertCircle className="w-3.5 h-3.5" />
                None
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Spotify <span className="text-[9px] font-bold text-amber-400/90 font-mono">(Beta)</span>:</span>
            </span>
            {activeSpotify ? (
              <span className="text-emerald-400 flex items-center gap-1 font-mono text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5" />
                {activeSpotify.label}
              </span>
            ) : (
              <span className="text-amber-500/80 flex items-center gap-1 text-[11px]">
                <AlertCircle className="w-3.5 h-3.5" />
                None
              </span>
            )}
          </div>
        </div>

        {/* Admin Nav Button */}
        <button
          onClick={() => setActiveTab('admin')}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'admin'
              ? 'bg-slate-800 text-white border border-slate-600'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#161f30]'
          }`}
        >
          <div className="flex items-center gap-3">
            <Settings className={`w-5 h-5 ${activeTab === 'admin' ? 'text-cyan-400' : 'text-slate-400'}`} />
            <span>Admin & Accounts</span>
          </div>
        </button>
      </div>
    </aside>
  );
};

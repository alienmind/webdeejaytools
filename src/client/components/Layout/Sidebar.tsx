import React, { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowLeftRight, Download, Settings, Disc3, ShieldCheck, AlertCircle, ListMusic, X } from 'lucide-react';
import { RedactedAccount } from '../../../shared/types.js';

export type ActiveTab = 'converter' | 'downloader' | 'mp3' | 'admin';

interface SidebarProps {
  accounts: RedactedAccount[];
  activeDownloadCount: number;
  /** Drawer state, used below the md breakpoint. */
  open: boolean;
  onClose: () => void;
}

interface NavItemProps {
  to: string;
  label: string;
  icon: React.ReactNode;
  activeClass: string;
  badge?: number;
  onNavigate: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ to, label, icon, activeClass, badge, onNavigate }) => (
  <NavLink
    to={to}
    onClick={onNavigate}
    className={({ isActive }) =>
      `w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
        isActive ? activeClass : 'text-slate-300 hover:text-white hover:bg-[#161f30]'
      }`
    }
  >
    <div className="flex items-center gap-3">
      {icon}
      <span>{label}</span>
    </div>
    {badge !== undefined && badge > 0 && (
      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-500 text-white">{badge}</span>
    )}
  </NavLink>
);

/**
 * Navigation rail.
 *
 * Fixed rail from `md` up; a dismissible drawer below it. The previous version was a hard
 * `w-64 shrink-0` with no responsive classes at all, so on a 375px viewport it took 68% of the
 * width and left 119px for content.
 */
export const Sidebar: React.FC<SidebarProps> = ({ accounts, activeDownloadCount, open, onClose }) => {
  const activeQobuz = accounts.find((a) => a.service === 'qobuz' && a.isActive);
  const activeSpotify = accounts.find((a) => a.service === 'spotify' && a.isActive);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes the drawer. Only bound while it is open, and only relevant on small screens.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        ref={panelRef}
        tabIndex={-1}
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0d1322] border-r border-[#1e293b] flex flex-col justify-between select-none transition-transform duration-200 md:static md:z-auto md:translate-x-0 md:shrink-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-6 border-b border-[#1e293b] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center shadow-glow-cyan shrink-0">
              <Disc3 className="w-6 h-6 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                <span>WebDeeJay</span>
                <span className="text-cyan-300 font-mono text-xs px-1.5 py-0.5 bg-cyan-950/70 border border-cyan-700 rounded">
                  TOOLS
                </span>
              </h1>
              <p className="text-xs text-slate-300">DJ Automation Suite</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close navigation"
              className="ml-auto rounded-lg p-1.5 text-slate-300 hover:bg-[#161f30] hover:text-white md:hidden"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <nav className="p-4 space-y-1.5">
            <NavItem
              to="/converter"
              label="Playlist Converter"
              onNavigate={onClose}
              icon={<ArrowLeftRight className="w-5 h-5" aria-hidden="true" />}
              activeClass="bg-gradient-to-r from-cyan-950/80 to-blue-950/40 text-cyan-200 border border-cyan-500/40 shadow-glow-cyan"
            />
            <NavItem
              to="/downloader"
              label="Audio Downloader"
              onNavigate={onClose}
              badge={activeDownloadCount}
              icon={<Download className="w-5 h-5" aria-hidden="true" />}
              activeClass="bg-gradient-to-r from-purple-950/80 to-pink-950/40 text-purple-200 border border-purple-500/40 shadow-glow-purple"
            />
            <NavItem
              to="/mp3"
              label="MP3 Management"
              onNavigate={onClose}
              icon={<ListMusic className="w-5 h-5" aria-hidden="true" />}
              activeClass="bg-gradient-to-r from-emerald-950/80 to-teal-950/40 text-emerald-200 border border-emerald-500/40 shadow-glow-emerald"
            />
          </nav>
        </div>

        <div className="p-4 border-t border-[#1e293b] space-y-3">
          <div className="bg-[#111827] p-3 rounded-xl border border-[#1e293b] space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" aria-hidden="true"></span>
                Qobuz:
              </span>
              {activeQobuz ? (
                <span className="text-emerald-300 flex items-center gap-1 font-mono text-[11px] truncate">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{activeQobuz.label}</span>
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1 text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  None
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true"></span>
                <span>
                  Spotify <span className="text-[9px] font-bold text-amber-300 font-mono">(Beta)</span>:
                </span>
              </span>
              {activeSpotify ? (
                <span className="text-emerald-300 flex items-center gap-1 font-mono text-[11px] truncate">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{activeSpotify.label}</span>
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1 text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  None
                </span>
              )}
            </div>
          </div>

          <NavItem
            to="/admin"
            label="Admin & Accounts"
            onNavigate={onClose}
            icon={<Settings className="w-5 h-5" aria-hidden="true" />}
            activeClass="bg-slate-800 text-white border border-slate-500"
          />
        </div>
      </aside>
    </>
  );
};

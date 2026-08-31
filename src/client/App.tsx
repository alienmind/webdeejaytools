import React, { Suspense, lazy, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Menu, Loader2 } from 'lucide-react';
import { Sidebar } from './components/Layout/Sidebar.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { ToastProvider } from './components/Toast.js';
import { AppDataProvider, useAppData } from './context/AppDataContext.js';
import { useSSE } from './hooks/useSSE.js';

/**
 * Routes are lazy so a user opening the Converter does not download the MP3 management module,
 * which is by far the largest bundle in the app.
 */
const ConverterPage = lazy(() => import('./pages/Converter/index.js').then((m) => ({ default: m.ConverterPage })));
const DownloaderPage = lazy(() => import('./pages/Downloader/index.js').then((m) => ({ default: m.DownloaderPage })));
const Mp3ManagementPage = lazy(() =>
  import('./pages/Mp3Management/index.js').then((m) => ({ default: m.Mp3ManagementPage }))
);
const AdminPage = lazy(() => import('./pages/Admin/index.js').then((m) => ({ default: m.AdminPage })));

const RouteFallback: React.FC = () => (
  <div className="flex h-full items-center justify-center p-10" role="status" aria-label="Loading view">
    <Loader2 className="h-6 w-6 animate-spin text-cyan-400" aria-hidden="true" />
  </div>
);

const Shell: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { accounts, settings, loadError } = useAppData();
  const { downloadQueue } = useSSE();
  const location = useLocation();

  const activeDownloads = downloadQueue.filter(
    (i) => i.status === 'downloading' || i.status === 'tagging'
  ).length;

  return (
    // min-h-screen rather than h-screen so mobile browser chrome cannot clip the last row.
    <div className="flex min-h-screen bg-[#090d16] text-slate-100 font-sans md:h-screen md:overflow-hidden">
      <Sidebar
        accounts={accounts}
        activeDownloadCount={activeDownloads}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header. Hidden from md up, where the sidebar is always visible. */}
        <header className="flex items-center gap-3 border-b border-[#1e293b] bg-[#0d1322] px-4 py-3 md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            className="rounded-lg p-2 text-slate-200 hover:bg-[#161f30]"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="font-bold tracking-tight text-white">WebDeeJayTOOLS</span>
          {activeDownloads > 0 && (
            <span className="ml-auto rounded-full bg-purple-500 px-2 py-0.5 text-xs font-bold text-white">
              {activeDownloads}
            </span>
          )}
        </header>

        {loadError && (
          <div
            role="alert"
            className="border-b border-red-500/40 bg-red-950/40 px-4 py-2 text-sm text-red-200"
          >
            {loadError} - the local server may not be running.
          </div>
        )}

        <main
          className="flex-1 overflow-y-auto bg-gradient-to-b from-[#0d1322] via-[#090d16] to-[#070a12] pb-[env(safe-area-inset-bottom)]"
          id="main-content"
        >
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Navigate to="/converter" replace />} />
                <Route path="/converter" element={<ConverterPage accounts={accounts} />} />
                <Route
                  path="/downloader"
                  element={<DownloaderPage settings={settings} queue={downloadQueue} />}
                />
                <Route path="/mp3" element={<Mp3ManagementPage settings={settings} />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="*" element={<Navigate to="/converter" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

/**
 * Hash routing rather than history routing: it behaves identically under the Vite dev server, the
 * Electron build's embedded server, and a file:// load, so it does not compromise portability.
 */
export const App: React.FC = () => (
  <ToastProvider>
    <AppDataProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AppDataProvider>
  </ToastProvider>
);

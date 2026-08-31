import React, { useState, useEffect } from 'react';
import { Sidebar, ActiveTab } from './components/Layout/Sidebar.js';
import { ConverterPage } from './pages/Converter/index.js';
import { DownloaderPage } from './pages/Downloader/index.js';
import { Mp3ManagementPage } from './pages/Mp3Management/index.js';
import { AdminPage } from './pages/Admin/index.js';
import { useSSE } from './hooks/useSSE.js';
import { Account, AppSettings } from '../shared/types.js';
import { api } from './services/api.js';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('converter');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    defaultDownloadDir: './downloads',
    defaultLibraryDir: './library',
    defaultQuality: 6,
    embedArtwork: true,
    createM3u: true,
    folderFormat: '{artist} - {album} ({year})',
    trackFormat: '{trackNumber} - {title}',
    djMode: true,
  });

  const { downloadQueue } = useSSE();

  const loadData = async () => {
    try {
      const [accs, sets] = await Promise.all([
        api.getAccounts(),
        api.getSettings(),
      ]);
      setAccounts(accs);
      setSettings(sets);
    } catch (err) {
      console.warn('Initial data load error:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeDownloads = downloadQueue.filter((i) => i.status === 'downloading' || i.status === 'tagging').length;

  return (
    <div className="flex h-screen bg-[#090d16] text-slate-100 overflow-hidden font-sans">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        accounts={accounts}
        activeDownloadCount={activeDownloads}
      />

      <main className="flex-1 h-screen overflow-y-auto bg-gradient-to-b from-[#0d1322] via-[#090d16] to-[#070a12]">
        {activeTab === 'converter' && <ConverterPage accounts={accounts} />}
        {activeTab === 'downloader' && <DownloaderPage settings={settings} queue={downloadQueue} />}
        {activeTab === 'mp3' && <Mp3ManagementPage settings={settings} />}
        {activeTab === 'admin' && (
          <AdminPage
            accounts={accounts}
            settings={settings}
            onAccountsUpdated={loadData}
            onSettingsUpdated={setSettings}
          />
        )}
      </main>
    </div>
  );
};

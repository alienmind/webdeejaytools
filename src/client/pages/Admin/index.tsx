import React, { useState } from 'react';
import {
  Settings,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  Sliders,
  Sparkles,
  Key,
  Pencil,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { Account, AppSettings, AuthTestResult, QualityId, ServiceType } from '../../../shared/types.js';
import { api } from '../../services/api.js';

interface AdminPageProps {
  accounts: Account[];
  settings: AppSettings;
  onAccountsUpdated: () => void;
  onSettingsUpdated: (newSettings: AppSettings) => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({
  accounts,
  settings,
  onAccountsUpdated,
  onSettingsUpdated,
}) => {
  // Modal / Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpTab, setHelpTab] = useState<'curl' | 'cookie'>('curl');
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [newService, setNewService] = useState<ServiceType>('qobuz');
  const [newLabel, setNewLabel] = useState('');
  // Qobuz fields
  const [qobuzUserAuthToken, setQobuzUserAuthToken] = useState('');
  const [qobuzCookieInput, setQobuzCookieInput] = useState('');
  const [isImportingCookie, setIsImportingCookie] = useState(false);
  // Spotify fields
  const [spotifyClientId, setSpotifyClientId] = useState('');
  const [spotifyClientSecret, setSpotifyClientSecret] = useState('');
  const [spotifyAccessToken, setSpotifyAccessToken] = useState('');

  // Local settings state
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Test status state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, AuthTestResult>>({});
  const [savingAccount, setSavingAccount] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const openAddModal = () => {
    setEditingAccountId(null);
    setNewService('qobuz');
    setNewLabel('');
    setQobuzUserAuthToken('');
    setQobuzCookieInput('');
    setSpotifyClientId('');
    setSpotifyClientSecret('');
    setSpotifyAccessToken('');
    setModalError(null);
    setShowAddModal(true);
  };

  const openEditModal = (acc: Account) => {
    setEditingAccountId(acc.id);
    setNewService(acc.service);
    setNewLabel(acc.label);
    setModalError(null);

    if (acc.service === 'qobuz') {
      setQobuzUserAuthToken(acc.credentials.qobuz?.userAuthToken || '');
      setQobuzCookieInput(''); // Always empty in Edit mode (one-way pasting field)
      setSpotifyClientId('');
      setSpotifyClientSecret('');
      setSpotifyAccessToken('');
    } else {
      setSpotifyClientId(acc.credentials.spotify?.clientId || '');
      setSpotifyClientSecret(acc.credentials.spotify?.clientSecret || '');
      setSpotifyAccessToken(acc.credentials.spotify?.accessToken || '');
      setQobuzUserAuthToken('');
      setQobuzCookieInput('');
    }

    setShowAddModal(true);
  };

  const handleImportCookie = async () => {
    if (!qobuzCookieInput.trim()) return;
    setIsImportingCookie(true);
    setModalError(null);
    try {
      await api.importQobuzCookie(
        qobuzCookieInput.trim(),
        newLabel.trim() || undefined,
        editingAccountId || undefined
      );
      onAccountsUpdated();
      setShowAddModal(false);
      setEditingAccountId(null);
      setNewLabel('');
      setQobuzCookieInput('');
      setQobuzUserAuthToken('');
    } catch (err: any) {
      setModalError(err.message || 'Failed to import session from cookie');
    } finally {
      setIsImportingCookie(false);
    }
  };

  const handleTestAccount = async (account: Account) => {
    setTestingId(account.id);
    try {
      const result = await api.testAccount(account.service, account.credentials);
      setTestResults((prev) => ({ ...prev, [account.id]: result }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [account.id]: {
          success: false,
          service: account.service,
          message: err.message || 'Test failed',
        },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleActivateAccount = async (id: string) => {
    try {
      await api.setActiveAccount(id);
      onAccountsUpdated();
    } catch (err) {
      console.error('Failed to activate account:', err);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (confirm('Are you sure you want to delete this account?')) {
      try {
        await api.deleteAccount(id);
        onAccountsUpdated();
      } catch (err) {
        console.error('Failed to delete account:', err);
      }
    }
  };

  const handleSaveNewAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;

    setSavingAccount(true);
    setModalError(null);

    try {
      const credentials: any = {};
      if (newService === 'qobuz') {
        credentials.qobuz = {
          userAuthToken: qobuzUserAuthToken.trim() || qobuzCookieInput.trim() || undefined,
        };
      } else {
        credentials.spotify = {
          clientId: spotifyClientId.trim() || undefined,
          clientSecret: spotifyClientSecret.trim() || undefined,
          accessToken: spotifyAccessToken.trim() || undefined,
        };
      }

      await api.saveAccount({
        id: editingAccountId || undefined,
        service: newService,
        label: newLabel.trim(),
        credentials,
      });

      onAccountsUpdated();
      setShowAddModal(false);
      setEditingAccountId(null);
      // Reset
      setNewLabel('');
      setQobuzUserAuthToken('');
      setQobuzCookieInput('');
      setSpotifyClientId('');
      setSpotifyClientSecret('');
      setSpotifyAccessToken('');
    } catch (err: any) {
      setModalError(err.message || 'Failed to save account');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess(false);

    try {
      const updated = await api.updateSettings(localSettings);
      onSettingsUpdated(updated);
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-3">
            <span className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400">
              <Sliders className="w-6 h-6" />
            </span>
            <span>Admin & Accounts</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Configure streaming accounts, Qobuz dynamic bundle scraping secrets, and global download settings.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-semibold rounded-xl transition-all shadow-glow-cyan flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add Account</span>
        </button>
      </div>

      {/* Accounts Grid */}
      <section className="space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <span>Connected Accounts</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
            {accounts.length}
          </span>
        </h3>

        {accounts.length === 0 ? (
          <div className="p-8 bg-[#111827] border border-[#1e293b] rounded-2xl text-center text-slate-500 text-sm">
            <Key className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No streaming accounts configured yet.</p>
            <button
              onClick={openAddModal}
              className="mt-3 text-cyan-400 text-xs hover:underline"
            >
              Add your first account now
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map((acc) => {
              const isQobuz = acc.service === 'qobuz';
              const testResult = testResults[acc.id];
              const isTesting = testingId === acc.id;

              return (
                <div
                  key={acc.id}
                  className={`p-5 rounded-2xl bg-[#111827] border transition-all ${
                    acc.isActive ? 'border-cyan-500/60 shadow-glow-cyan' : 'border-[#1e293b]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${isQobuz ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-base">{acc.label}</h4>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${isQobuz ? 'bg-blue-950 text-blue-300' : 'bg-emerald-950 text-emerald-300'}`}>
                            {acc.service}
                          </span>
                        </div>
                        {acc.credentials.qobuz?.email && (
                          <p className="text-xs text-slate-400 font-mono">{acc.credentials.qobuz.email}</p>
                        )}
                        {acc.credentials.qobuz?.userAuthToken && !acc.credentials.qobuz?.email && (
                          <p className="text-xs text-cyan-400/80 font-mono">Token: {acc.credentials.qobuz.userAuthToken.substring(0, 10)}...</p>
                        )}
                        {acc.credentials.spotify?.clientId && (
                          <p className="text-xs text-slate-400 font-mono">Client ID: {acc.credentials.spotify.clientId.substring(0, 8)}...</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!acc.isActive && (
                        <button
                          onClick={() => handleActivateAccount(acc.id)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        >
                          Set Active
                        </button>
                      )}
                      {acc.isActive && (
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-cyan-950 border border-cyan-700/60 text-cyan-300 flex items-center gap-1 font-mono">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          ACTIVE
                        </span>
                      )}
                      <button
                        onClick={() => openEditModal(acc)}
                        title="Edit credentials"
                        className="p-1.5 text-slate-400 hover:text-cyan-300 rounded-lg hover:bg-cyan-950/40 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(acc.id)}
                        title="Delete account"
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-950/40 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Actions & Diagnostics */}
                  <div className="mt-4 pt-3 border-t border-[#1e293b] flex items-center justify-between text-xs">
                    <button
                      onClick={() => handleTestAccount(acc)}
                      disabled={isTesting}
                      className="text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1.5 transition-colors"
                    >
                      {isTesting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Testing credentials...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Test Connection</span>
                        </>
                      )}
                    </button>

                    {testResult && (
                      <span className={`flex items-center gap-1 text-[11px] font-medium ${testResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                        {testResult.success ? 'Connected OK' : 'Auth Failed'}
                      </span>
                    )}
                  </div>

                  {testResult && testResult.message && (
                    <div className={`mt-2 p-2.5 rounded-lg text-[11px] font-mono ${testResult.success ? 'bg-emerald-950/40 border border-emerald-800/40 text-emerald-300' : 'bg-rose-950/40 border border-rose-800/40 text-rose-300'}`}>
                      {testResult.message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Global App Settings */}
      <section className="bg-[#111827] border border-[#1e293b] rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-white">Global Downloader Settings</h3>
          </div>
          {settingsSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1 font-bold animate-fadeIn">
              <CheckCircle2 className="w-4 h-4" /> Settings Saved!
            </span>
          )}
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Default Download Directory</label>
              <input
                type="text"
                value={localSettings.defaultDownloadDir}
                onChange={(e) => setLocalSettings({ ...localSettings, defaultDownloadDir: e.target.value })}
                className="w-full px-4 py-2.5 bg-[#090d16] border border-[#1e293b] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Default Audio Quality</label>
              <select
                value={localSettings.defaultQuality}
                onChange={(e) => setLocalSettings({ ...localSettings, defaultQuality: Number(e.target.value) as QualityId })}
                className="w-full px-4 py-2.5 bg-[#090d16] border border-[#1e293b] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value={5}>MP3 320 kbps</option>
                <option value={6}>FLAC 16-bit / 44.1 kHz CD Quality</option>
                <option value={7}>FLAC 24-bit / up to 96 kHz Hi-Res</option>
                <option value={27}>FLAC 24-bit / up to 192 kHz Hi-Res</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Folder Naming Template</label>
              <input
                type="text"
                value={localSettings.folderFormat}
                onChange={(e) => setLocalSettings({ ...localSettings, folderFormat: e.target.value })}
                className="w-full px-4 py-2.5 bg-[#090d16] border border-[#1e293b] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
              <span className="text-[10px] text-slate-500">Variables: {'{artist}'}, {'{album}'}, {'{year}'}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Track Filename Template</label>
              <input
                type="text"
                value={localSettings.trackFormat}
                onChange={(e) => setLocalSettings({ ...localSettings, trackFormat: e.target.value })}
                className="w-full px-4 py-2.5 bg-[#090d16] border border-[#1e293b] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
              <span className="text-[10px] text-slate-500">Variables: {'{trackNumber}'}, {'{title}'}, {'{artist}'}</span>
            </div>
          </div>

          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={localSettings.embedArtwork}
                onChange={(e) => setLocalSettings({ ...localSettings, embedArtwork: e.target.checked })}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-600 focus:ring-0"
              />
              <span>Embed Album Artwork into MP3/FLAC</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={localSettings.createM3u}
                onChange={(e) => setLocalSettings({ ...localSettings, createM3u: e.target.checked })}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-600 focus:ring-0"
              />
              <span>Create Extended .m3u Playlist Files</span>
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all border border-slate-600"
            >
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </section>

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-[#1e293b] rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-5 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
              <h3 className="font-bold text-white text-base">
                {editingAccountId ? 'Edit Streaming Account' : 'Add Streaming Account'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {modalError && (
              <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveNewAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Service Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewService('qobuz')}
                    className={`p-2.5 rounded-xl border text-xs font-medium transition-all ${
                      newService === 'qobuz'
                        ? 'bg-blue-950/80 border-blue-500 text-blue-300'
                        : 'bg-[#090d16] border-[#1e293b] text-slate-400'
                    }`}
                  >
                    Qobuz
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewService('spotify')}
                    className={`p-2.5 rounded-xl border text-xs font-medium transition-all ${
                      newService === 'spotify'
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                        : 'bg-[#090d16] border-[#1e293b] text-slate-400'
                    }`}
                  >
                    Spotify
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Account Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. My Primary Account"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {newService === 'qobuz' ? (
                <div className="p-4 bg-[#0a0f1d] border border-cyan-900/60 rounded-xl space-y-4">
                  {/* Top Bar with Title & Action Links */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-cyan-400" />
                      Qobuz Token Authentication
                    </label>
                    <div className="flex items-center gap-2">
                      <a
                        href="https://play.qobuz.com"
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-[#111827] border border-[#1e293b] text-slate-300 hover:text-cyan-300 hover:border-cyan-500 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
                        title="Open Qobuz Web Player in a new tab to capture your token"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Open play.qobuz.com</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => setShowHelpModal(true)}
                        className="px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-700/80 text-cyan-300 hover:text-white hover:border-cyan-400 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
                        title="Step-by-step visual guide on getting your token"
                      >
                        <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                        <span>How to get token?</span>
                      </button>
                    </div>
                  </div>

                  {/* Token Field */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase font-mono text-slate-400">
                      User Auth Token (user_auth_token)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. paste your user_auth_token or use importer below..."
                      value={qobuzUserAuthToken}
                      onChange={(e) => setQobuzUserAuthToken(e.target.value)}
                      className="w-full px-3 py-2 bg-[#060911] border border-[#1e293b] rounded-xl text-xs text-cyan-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>

                  {/* Quick Importer Box */}
                  <div className="pt-3 border-t border-[#1e293b] space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-300">
                      Quick Importer (Paste Cookie header, cURL, or Token)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Paste your Cookie header, cURL command, or user_auth_token from Chrome..."
                      value={qobuzCookieInput}
                      onChange={(e) => setQobuzCookieInput(e.target.value)}
                      className="w-full px-3 py-2 bg-[#060911] border border-[#1e293b] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono resize-none"
                    />
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={isImportingCookie || !qobuzCookieInput.trim()}
                        onClick={handleImportCookie}
                        className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 shadow-md shadow-cyan-950"
                      >
                        {isImportingCookie ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        <span>Import from Cookie / cURL</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Spotify Client ID</label>
                    <input
                      type="text"
                      placeholder="Developer App Client ID"
                      value={spotifyClientId}
                      onChange={(e) => setSpotifyClientId(e.target.value)}
                      className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Spotify Client Secret</label>
                    <input
                      type="password"
                      placeholder="Developer App Client Secret"
                      value={spotifyClientSecret}
                      onChange={(e) => setSpotifyClientSecret(e.target.value)}
                      className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">User OAuth Access Token (Optional for user playlist writes)</label>
                    <input
                      type="text"
                      placeholder="Bearer token or OAuth token"
                      value={spotifyAccessToken}
                      onChange={(e) => setSpotifyAccessToken(e.target.value)}
                      className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-[#1e293b]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAccount}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-cyan-950"
                >
                  {savingAccount ? 'Saving...' : (editingAccountId ? 'Update Account' : 'Save Account')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Visual Token Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-[#1e293b] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-fadeIn">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#1e293b] flex items-center justify-between bg-[#0d1322]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                  <HelpCircle className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">How to Get Your Qobuz Token</h3>
                  <p className="text-xs text-slate-400">Step-by-step guide</p>
                </div>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-lg transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Method Tabs */}
            <div className="px-5 pt-3 bg-[#0d1322] border-b border-[#1e293b] flex gap-2">
              <button
                type="button"
                onClick={() => setHelpTab('curl')}
                className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all border-b-2 ${
                  helpTab === 'curl'
                    ? 'bg-[#111827] text-cyan-300 border-cyan-400'
                    : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
              >
                ⚡ Copy as cURL (Fastest)
              </button>
              <button
                type="button"
                onClick={() => setHelpTab('cookie')}
                className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all border-b-2 ${
                  helpTab === 'cookie'
                    ? 'bg-[#111827] text-cyan-300 border-cyan-400'
                    : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
              >
                🍪 Application Cookies
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed">
              {helpTab === 'curl' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-800/40 text-blue-200 flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white">Recommended & Easiest:</strong> Right-clicking any request in Chrome DevTools captures your token, session cookies, and headers in one click!
                    </div>
                  </div>

                  <img
                    src="/assets/help/step3_network_curl.png"
                    alt="Copy as cURL in Chrome Network tab"
                    className="w-full rounded-xl border border-[#1e293b] shadow-xl object-contain bg-[#090d16]"
                  />

                  <ol className="list-decimal list-inside space-y-2 text-slate-300 font-medium">
                    <li>Open <a href="https://play.qobuz.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline">play.qobuz.com</a> in your Chrome/Brave/Edge browser and ensure you are logged in.</li>
                    <li>Press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[11px] font-mono text-cyan-300">F12</kbd> (or Right Click → <em>Inspect</em>) to open Chrome Developer Tools.</li>
                    <li>Click on the <strong className="text-white">Network</strong> tab at the top of DevTools.</li>
                    <li>Click on any album, playlist, or refresh the page to trigger network requests.</li>
                    <li>Right-click any request (e.g. <code>getUserFavorites</code>) → <strong className="text-white">Copy → Copy as cURL</strong>.</li>
                    <li>Paste the copied text directly into the <strong className="text-white">Quick Importer</strong> box in WebDeeJayTools and click <strong className="text-cyan-300">Import from Cookie / cURL</strong>!</li>
                  </ol>
                </div>
              )}

              {helpTab === 'cookie' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-200 flex items-start gap-2.5">
                    <Key className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white">Direct Cookie Inspection:</strong> You can copy the exact <code>user_auth_token</code> value directly from Chrome's cookie storage.
                    </div>
                  </div>

                  <img
                    src="/assets/help/step2_application_cookies.png"
                    alt="Application Cookies in Chrome DevTools"
                    className="w-full rounded-xl border border-[#1e293b] shadow-xl object-contain bg-[#090d16]"
                  />

                  <ol className="list-decimal list-inside space-y-2 text-slate-300 font-medium">
                    <li>Open <a href="https://play.qobuz.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline">play.qobuz.com</a> in Chrome.</li>
                    <li>Press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[11px] font-mono text-cyan-300">F12</kbd> and switch to the <strong className="text-white">Application</strong> tab.</li>
                    <li>In the left sidebar, expand <strong className="text-white">Storage → Cookies → https://play.qobuz.com</strong>.</li>
                    <li>Find the cookie named <code className="text-cyan-300 font-mono">user_auth_token</code>.</li>
                    <li>Double-click the <strong className="text-white">Value</strong> cell, press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[11px] font-mono text-cyan-300">Ctrl+C</kbd>, and paste it into the <strong className="text-white">User Auth Token</strong> field!</li>
                  </ol>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#0d1322] border-t border-[#1e293b] flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all border border-slate-600"
              >
                Got It, Close Guide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

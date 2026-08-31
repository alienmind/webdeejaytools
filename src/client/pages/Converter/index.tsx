import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  Sparkles,
  RefreshCw,
  Disc,
} from 'lucide-react';
import { Account, PlaylistSummary, ServiceType, TrackItem, TrackMatch } from '../../../shared/types.js';
import { api } from '../../services/api.js';

interface ConverterPageProps {
  accounts: Account[];
}

export const ConverterPage: React.FC<ConverterPageProps> = ({ accounts }) => {
  // Step 1: Input & Preview
  const [url, setUrl] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{
    service: ServiceType;
    type: 'track' | 'album' | 'playlist';
    title: string;
    artist?: string;
    coverUrl?: string;
    tracks: TrackItem[];
  } | null>(null);

  // Step 2: Destination Settings
  const [targetService, setTargetService] = useState<ServiceType>('spotify');
  const [targetAccountId, setTargetAccountId] = useState<string>('');
  const [playlistMode, setPlaylistMode] = useState<'existing' | 'new'>('new');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [targetPlaylists, setTargetPlaylists] = useState<PlaylistSummary[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);

  // Step 3: Matching
  const [matchingInProgress, setMatchingInProgress] = useState(false);
  const [matchResults, setMatchResults] = useState<{
    total: number;
    matched: number;
    missed: number;
    matchRate: number;
    matches: TrackMatch[];
  } | null>(null);

  // Step 4: Sync
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    playlistId: string;
    playlistTitle: string;
    addedTracksCount: number;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

  // Auto-select target accounts when target service changes
  useEffect(() => {
    const serviceAccounts = accounts.filter((a) => a.service === targetService);
    const active = serviceAccounts.find((a) => a.isActive) || serviceAccounts[0];
    if (active) {
      setTargetAccountId(active.id);
    } else {
      setTargetAccountId('');
    }
  }, [targetService, accounts]);

  // Load playlists when target account is chosen and mode is 'existing'
  useEffect(() => {
    if (playlistMode === 'existing' && targetAccountId) {
      setLoadingPlaylists(true);
      api.getUserPlaylists(targetService, targetAccountId)
        .then((pls) => {
          setTargetPlaylists(pls);
          if (pls.length > 0 && !selectedPlaylistId) {
            setSelectedPlaylistId(pls[0].id);
          }
        })
        .catch((err) => console.warn('Failed to load user playlists:', err))
        .finally(() => setLoadingPlaylists(false));
    }
  }, [playlistMode, targetAccountId, targetService]);

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setError(null);
    setLoadingPreview(true);
    setPreviewData(null);
    setMatchResults(null);
    setSyncResult(null);

    try {
      const data = await api.previewConverterUrl(url.trim());
      setPreviewData(data);
      // Auto-configure target service to opposite service
      const opposite = data.service === 'qobuz' ? 'spotify' : 'qobuz';
      setTargetService(opposite);
      setNewPlaylistName(`${data.title} [Synced]`);
    } catch (err: any) {
      setError(err.message || 'Failed to preview tracks from URL');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleRunMatch = async () => {
    if (!previewData || previewData.tracks.length === 0) return;

    setError(null);
    setMatchingInProgress(true);
    setSyncResult(null);

    try {
      const res = await api.matchTracks(previewData.tracks, targetService, targetAccountId);
      setMatchResults(res);
    } catch (err: any) {
      setError(err.message || 'Matching engine encountered an error');
    } finally {
      setMatchingInProgress(false);
    }
  };

  const handleSync = async () => {
    if (!matchResults) return;

    setError(null);
    setSyncing(true);

    try {
      const res = await api.syncToTarget(
        targetService,
        targetAccountId,
        playlistMode === 'existing' ? selectedPlaylistId : undefined,
        playlistMode === 'new' ? newPlaylistName : undefined,
        playlistMode === 'new',
        matchResults.matches
      );
      setSyncResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to commit tracks to target playlist');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-3">
            <span className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-700/50 text-cyan-400">
              <RefreshCw className="w-6 h-6" />
            </span>
            <span>Playlist Converter</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Seamlessly migrate and sync playlists between Qobuz and Spotify with 4-tier fuzzy matching.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-200 text-sm flex items-center gap-3">
          <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: Input URL */}
      <section className="bg-[#111827] border border-[#1e293b] rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-cyan-500 text-black text-xs font-bold flex items-center justify-center">1</span>
            <h3 className="font-semibold text-white">Source Input</h3>
          </div>
          <span className="text-xs text-slate-400">Accepts Spotify & Qobuz track, album, or playlist links</span>
        </div>

        <form onSubmit={handlePreview} className="flex gap-3">
          <input
            type="text"
            placeholder="Paste Spotify or Qobuz URL (e.g. https://open.spotify.com/playlist/... or https://play.qobuz.com/album/...)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 px-4 py-3 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-mono"
          />
          <button
            type="submit"
            disabled={loadingPreview || !url.trim()}
            className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-semibold rounded-xl transition-all shadow-glow-cyan disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
          >
            {loadingPreview ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Resolving...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Preview Tracks</span>
              </>
            )}
          </button>
        </form>

        {previewData && (
          <div className="p-4 rounded-xl bg-[#090d16] border border-[#1e293b] flex items-center justify-between">
            <div className="flex items-center gap-4">
              {previewData.coverUrl ? (
                <img src={previewData.coverUrl} alt="Cover" className="w-16 h-16 rounded-lg object-cover border border-[#1e293b]" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center">
                  <Disc className="w-8 h-8 text-slate-500" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${previewData.service === 'qobuz' ? 'bg-blue-900 text-blue-300' : 'bg-emerald-900 text-emerald-300'}`}>
                    {previewData.service}
                  </span>
                  <span className="text-xs text-slate-400 uppercase font-mono">{previewData.type}</span>
                </div>
                <h4 className="text-base font-bold text-white mt-0.5">{previewData.title}</h4>
                {previewData.artist && <p className="text-xs text-slate-400">{previewData.artist}</p>}
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl font-mono font-bold text-cyan-400">{previewData.tracks.length}</span>
              <p className="text-xs text-slate-400">tracks found</p>
            </div>
          </div>
        )}
      </section>

      {/* Step 2: Target Routing */}
      {previewData && (
        <section className="bg-[#111827] border border-[#1e293b] rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-cyan-500 text-black text-xs font-bold flex items-center justify-center">2</span>
              <h3 className="font-semibold text-white">Target Service & Playlist Setup</h3>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Target Service & Account */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Target Destination Service</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTargetService('spotify')}
                    className={`p-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                      targetService === 'spotify'
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-glow-cyan'
                        : 'bg-[#090d16] border-[#1e293b] text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span>Spotify</span>
                    <span className="text-[9px] font-extrabold uppercase px-1 py-0.2 rounded bg-amber-950 border border-amber-600/70 text-amber-300">
                      BETA
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetService('qobuz')}
                    className={`p-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                      targetService === 'qobuz'
                        ? 'bg-blue-950/60 border-blue-500 text-blue-300 shadow-glow-cyan'
                        : 'bg-[#090d16] border-[#1e293b] text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                    <span>Qobuz</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Target Account</label>
                <select
                  value={targetAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  {accounts.filter((a) => a.service === targetService).length === 0 ? (
                    <option value="">No {targetService} account configured</option>
                  ) : (
                    accounts
                      .filter((a) => a.service === targetService)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label} {a.isActive ? '(Active)' : ''}
                        </option>
                      ))
                  )}
                </select>
              </div>
            </div>

            {/* Playlist Mode */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Target Playlist</label>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setPlaylistMode('new')}
                    className={`p-2.5 rounded-xl border text-xs font-medium transition-all ${
                      playlistMode === 'new'
                        ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                        : 'bg-[#090d16] border-[#1e293b] text-slate-400 hover:text-white'
                    }`}
                  >
                    Create New Playlist
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlaylistMode('existing')}
                    className={`p-2.5 rounded-xl border text-xs font-medium transition-all ${
                      playlistMode === 'existing'
                        ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                        : 'bg-[#090d16] border-[#1e293b] text-slate-400 hover:text-white'
                    }`}
                  >
                    Select Existing Playlist
                  </button>
                </div>

                {playlistMode === 'new' ? (
                  <input
                    type="text"
                    placeholder="New Playlist Name"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                ) : (
                  <select
                    value={selectedPlaylistId}
                    onChange={(e) => setSelectedPlaylistId(e.target.value)}
                    disabled={loadingPlaylists}
                    className="w-full px-4 py-2.5 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                  >
                    {loadingPlaylists ? (
                      <option>Loading user playlists...</option>
                    ) : targetPlaylists.length === 0 ? (
                      <option>No playlists found on target account</option>
                    ) : (
                      targetPlaylists.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.title} ({pl.trackCount} tracks)
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleRunMatch}
              disabled={matchingInProgress}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl text-sm transition-all shadow-glow-purple flex items-center gap-2"
            >
              {matchingInProgress ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Matching Catalog...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Execute 4-Tier Fuzzy Match</span>
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Match Results Table */}
      {matchResults && (
        <section className="bg-[#111827] border border-[#1e293b] rounded-2xl p-6 shadow-xl space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-cyan-500 text-black text-xs font-bold flex items-center justify-center">3</span>
              <h3 className="font-semibold text-white">Matching Results</h3>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="text-emerald-400 font-bold">{matchResults.matched} Matched</span>
              <span className="text-rose-400 font-bold">{matchResults.missed} Missed</span>
              <span className="px-2.5 py-1 rounded-full bg-cyan-950 border border-cyan-700/50 text-cyan-300 font-bold">
                {matchResults.matchRate}% Match Rate
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1e293b] text-slate-400 font-mono">
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-3">Source Track ({previewData?.service})</th>
                  <th className="py-3 px-3">Target Matched Track ({targetService})</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b]/60">
                {matchResults.matches.map((item, idx) => {
                  const isHit = item.status !== 'miss' && item.targetTrack;
                  return (
                    <tr key={idx} className="hover:bg-[#161f30]/60 transition-colors">
                      <td className="py-3 px-3 font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-200">{item.sourceTrack.title}</div>
                        <div className="text-slate-400">{item.sourceTrack.artist} • {item.sourceTrack.album}</div>
                        {item.sourceTrack.isrc && (
                          <span className="text-[10px] font-mono text-slate-500">ISRC: {item.sourceTrack.isrc}</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {isHit ? (
                          <div>
                            <div className="font-semibold text-white">{item.targetTrack!.title}</div>
                            <div className="text-slate-400">{item.targetTrack!.artist} • {item.targetTrack!.album}</div>
                          </div>
                        ) : (
                          <span className="text-rose-400/80 italic">No satisfactory catalog match</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {item.status === 'exact' && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-600 text-emerald-300 font-bold text-[10px]">
                            EXACT
                          </span>
                        )}
                        {item.status === 'high_confidence' && (
                          <span className="px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-600 text-cyan-300 font-bold text-[10px]">
                            HIGH
                          </span>
                        )}
                        {item.status === 'fuzzy' && (
                          <span className="px-2 py-0.5 rounded-full bg-purple-950 border border-purple-600 text-purple-300 font-bold text-[10px]">
                            FUZZY
                          </span>
                        )}
                        {item.status === 'miss' && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-950 border border-rose-700 text-rose-300 font-bold text-[10px]">
                            MISS
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold">
                        <span className={item.confidenceScore >= 80 ? 'text-emerald-400' : item.confidenceScore >= 60 ? 'text-cyan-400' : 'text-rose-400'}>
                          {item.confidenceScore}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Sync Action */}
          <div className="flex items-center justify-between pt-4 border-t border-[#1e293b]">
            <div className="text-xs text-slate-400">
              Ready to write <span className="text-white font-bold">{matchResults.matched}</span> tracks to target playlist on <span className="capitalize font-bold text-cyan-400">{targetService}</span>.
            </div>

            <button
              onClick={handleSync}
              disabled={syncing || matchResults.matched === 0}
              className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-sm transition-all shadow-glow-cyan flex items-center gap-2"
            >
              {syncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Syncing to {targetService}...</span>
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4" />
                  <span>Sync Matched Tracks</span>
                </>
              )}
            </button>
          </div>

          {/* Sync Outcome Alert */}
          {syncResult && (
            <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-500 text-emerald-200 text-sm flex items-center justify-between animate-fadeIn">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <h4 className="font-bold text-white">Sync Completed Successfully!</h4>
                  <p className="text-xs text-emerald-300">
                    Added {syncResult.addedTracksCount} tracks to playlist "{syncResult.playlistTitle}"
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

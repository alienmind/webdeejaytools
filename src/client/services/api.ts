import { Account, AppSettings, AuthTestResult, DownloadItemProgress, MatchOptions, PlaylistSummary, QualityId, ServiceType, TrackItem, TrackMatch } from '../../shared/types.js';

const API_BASE = '/api';

export const api = {
  // Accounts
  async getAccounts(): Promise<Account[]> {
    const res = await fetch(`${API_BASE}/accounts`);
    if (!res.ok) throw new Error('Failed to fetch accounts');
    return res.json();
  },

  async saveAccount(account: Partial<Account>): Promise<Account> {
    const res = await fetch(`${API_BASE}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save account');
    }
    return res.json();
  },

  async deleteAccount(id: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/accounts/${id}`, { method: 'DELETE' });
    const data = await res.json();
    return data.success;
  },

  async setActiveAccount(id: string): Promise<Account> {
    const res = await fetch(`${API_BASE}/accounts/${id}/activate`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to activate account');
    return res.json();
  },

  async testAccount(service: ServiceType, credentials: any): Promise<AuthTestResult> {
    const res = await fetch(`${API_BASE}/accounts/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, credentials }),
    });
    return res.json();
  },

  async loginQobuzViaBrowser(options: {
    email?: string;
    password?: string;
    label?: string;
    interactive?: boolean;
  }): Promise<{ success: boolean; account: Account; message?: string }> {
    const res = await fetch(`${API_BASE}/accounts/qobuz/browser-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Browser login failed');
    }
    return res.json();
  },

  async importQobuzCookie(input: string, label?: string, id?: string): Promise<{ success: boolean; account: Account; message: string }> {
    const res = await fetch(`${API_BASE}/accounts/qobuz/import-cookie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, label, id }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to import session');
    }
    return res.json();
  },

  async autoDetectLocalBrowserSession(): Promise<{ success: boolean; account: Account; message: string }> {
    const res = await fetch(`${API_BASE}/accounts/qobuz/auto-detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Auto-detection failed');
    }
    return res.json();
  },

  // Settings
  async getSettings(): Promise<AppSettings> {
    const res = await fetch(`${API_BASE}/settings`);
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return res.json();
  },

  async browseDirectory(currentPath?: string, title?: string): Promise<{ path?: string; canceled: boolean }> {
    const res = await fetch(`${API_BASE}/settings/browse-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPath, title }),
    });
    if (!res.ok) throw new Error('Failed to open directory dialog');
    return res.json();
  },

  // MP3 Collection Management
  async scanLocalDirectory(directory?: string): Promise<import('../../shared/types.js').ScanDirectoryResult> {
    const res = await fetch(`${API_BASE}/mp3/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to scan directory');
    }
    return res.json();
  },

  async createDjSet(request: import('../../shared/types.js').CreateDjSetRequest): Promise<import('../../shared/types.js').CreateDjSetResult> {
    const res = await fetch(`${API_BASE}/mp3/create-dj-set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create DJ set');
    }
    return res.json();
  },

  async deleteTracks(filePaths: string[], sourceDirectory?: string): Promise<import('../../shared/types.js').DeleteTracksResult> {
    const res = await fetch(`${API_BASE}/mp3/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePaths, sourceDirectory }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete tracks');
    }
    return res.json();
  },

  async listDjSets(): Promise<import('../../shared/types.js').DjSetItem[]> {
    const res = await fetch(`${API_BASE}/mp3/dj-sets`);
    if (!res.ok) return [];
    return res.json();
  },

  async analyzeTracks(filePaths: string[], writeTags: boolean = false): Promise<import('../../shared/types.js').AnalyzeTracksResponse> {
    const res = await fetch(`${API_BASE}/mp3/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePaths, writeTags }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to analyze tracks');
    }
    return res.json();
  },

  async analyzeTracksStream(
    filePaths: string[],
    writeTags: boolean = false,
    onProgress?: (progress: {
      type: 'progress_start' | 'progress' | 'complete';
      current: number;
      total: number;
      percent: number;
      filePath?: string;
      fileName?: string;
      result?: import('../../shared/types.js').AudioAnalysisResult;
    }) => void
  ): Promise<import('../../shared/types.js').AnalyzeTracksResponse> {
    const res = await fetch(`${API_BASE}/mp3/analyze-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePaths, writeTags }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to analyze tracks');
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('ReadableStream not supported');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let finalResponse: import('../../shared/types.js').AnalyzeTracksResponse = {
      results: [],
      processedCount: 0,
      successCount: 0,
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.type === 'progress' || data.type === 'progress_start') {
              if (onProgress) onProgress(data);
            } else if (data.type === 'complete') {
              finalResponse = data;
              if (onProgress) onProgress(data);
            }
          } catch {
            // Ignore parse errors on ping/comments
          }
        }
      }
    }

    return finalResponse;
  },

  getArtworkUrl(filePath: string): string {
    return `${API_BASE}/mp3/artwork?path=${encodeURIComponent(filePath)}`;
  },

  getStreamUrl(filePath: string): string {
    return `${API_BASE}/mp3/stream?path=${encodeURIComponent(filePath)}`;
  },

  // Converter
  async previewConverterUrl(url: string, accountId?: string): Promise<{
    service: ServiceType;
    type: 'track' | 'album' | 'playlist';
    title: string;
    artist?: string;
    coverUrl?: string;
    tracks: TrackItem[];
  }> {
    const res = await fetch(`${API_BASE}/convert/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, accountId }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to preview URL');
    }
    return res.json();
  },

  async getUserPlaylists(service: ServiceType, accountId?: string): Promise<PlaylistSummary[]> {
    const params = new URLSearchParams({ service });
    if (accountId) params.append('accountId', accountId);
    const res = await fetch(`${API_BASE}/convert/playlists?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to fetch playlists');
    }
    return res.json();
  },

  async matchTracks(
    tracks: TrackItem[],
    targetService: ServiceType,
    targetAccountId?: string,
    options?: MatchOptions
  ): Promise<{
    total: number;
    matched: number;
    missed: number;
    matchRate: number;
    matches: TrackMatch[];
  }> {
    const res = await fetch(`${API_BASE}/convert/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks, targetService, targetAccountId, options }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to run matcher');
    }
    return res.json();
  },

  async syncToTarget(
    targetService: ServiceType,
    targetAccountId: string | undefined,
    targetPlaylistId: string | undefined,
    targetPlaylistName: string | undefined,
    isNewPlaylist: boolean,
    matches: TrackMatch[]
  ): Promise<{
    success: boolean;
    playlistId: string;
    playlistTitle: string;
    addedTracksCount: number;
  }> {
    const res = await fetch(`${API_BASE}/convert/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetService,
        targetAccountId,
        targetPlaylistId,
        targetPlaylistName,
        isNewPlaylist,
        matches,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to sync to target');
    }
    return res.json();
  },

  // Downloader
  async previewDownloadUrl(url: string): Promise<{
    type: 'track' | 'album' | 'playlist';
    title: string;
    artist?: string;
    coverUrl?: string;
    tracks: TrackItem[];
  }> {
    const res = await fetch(`${API_BASE}/download/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to preview URL');
    }
    return res.json();
  },

  async enqueueDownloads(
    tracks: TrackItem[],
    quality?: QualityId,
    downloadDir?: string,
    playlistTitle?: string,
    createM3u?: boolean
  ): Promise<{ enqueuedCount: number; items: DownloadItemProgress[] }> {
    const res = await fetch(`${API_BASE}/download/enqueue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks, quality, downloadDir, playlistTitle, createM3u }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to enqueue downloads');
    }
    return res.json();
  },

  async getDownloadQueue(): Promise<DownloadItemProgress[]> {
    const res = await fetch(`${API_BASE}/download/queue`);
    if (!res.ok) throw new Error('Failed to fetch queue');
    return res.json();
  },

  async clearCompletedDownloads(): Promise<{ success: boolean; queue: DownloadItemProgress[] }> {
    const res = await fetch(`${API_BASE}/download/clear`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to clear completed items');
    return res.json();
  },
};

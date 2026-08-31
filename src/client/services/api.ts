import {
  AppSettings,
  AudioAnalysisResult,
  AnalysisJob,
  AnalyzeTracksResponse,
  AuthTestResult,
  CreateDjSetRequest,
  CreateDjSetResult,
  DeleteTracksResult,
  DjSetItem,
  DownloadItemProgress,
  MatchOptions,
  PlaylistSummary,
  QualityId,
  RedactedAccount,
  ScanDirectoryResult,
  ServiceType,
  TrackItem,
  TrackMatch,
} from '../../shared/types.js';

const API_BASE = '/api';

/**
 * Per-launch session token, injected into the served HTML by the Electron main process. Required on
 * mutating requests in the packaged build; absent under the Vite dev server, where the server does
 * not enforce it.
 */
const SESSION_TOKEN: string | undefined = (globalThis as any).__WDT_SESSION__;

export class ApiError extends Error {
  public readonly status: number;
  public readonly issues?: unknown;

  constructor(message: string, status: number, issues?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Single place that owns request construction and error shape.
 *
 * Previously every call re-implemented fetch, header setting, and `if (!res.ok) throw` - with
 * subtly different behaviour each time, including calls that assumed an error body was always JSON
 * and threw a parse error instead of the real message.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (SESSION_TOKEN) {
    headers['x-wdt-session'] = SESSION_TOKEN;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let issues: unknown;
    try {
      const parsed = await res.json();
      message = parsed?.error || message;
      issues = parsed?.issues;
    } catch {
      const text = await res.text().catch(() => '');
      if (text) message = text;
    }
    throw new ApiError(message, res.status, issues);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Fetch options for hand-rolled streaming calls that cannot use `request`. */
function streamHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (SESSION_TOKEN) headers['x-wdt-session'] = SESSION_TOKEN;
  return headers;
}

export interface AnalysisProgress {
  type: 'snapshot' | 'progress_start' | 'progress' | 'complete' | 'canceled' | 'failed';
  current: number;
  total: number;
  percent: number;
  filePath?: string;
  fileName?: string;
  result?: AudioAnalysisResult;
  results?: AudioAnalysisResult[];
  error?: string;
}

export const api = {
  // Accounts
  getAccounts: () => request<RedactedAccount[]>('/accounts'),

  saveAccount: (account: Record<string, unknown>) =>
    request<RedactedAccount>('/accounts', { method: 'POST', body: account }),

  deleteAccount: async (id: string) => {
    const data = await request<{ success: boolean }>(`/accounts/${id}`, { method: 'DELETE' });
    return data.success;
  },

  setActiveAccount: (id: string) =>
    request<RedactedAccount>(`/accounts/${id}/activate`, { method: 'POST', body: {} }),

  testAccount: (service: ServiceType, credentials: unknown) =>
    request<AuthTestResult>('/accounts/test', { method: 'POST', body: { service, credentials } }),

  importQobuzCookie: (input: string, label?: string, id?: string) =>
    request<{ success: boolean; account: RedactedAccount; message: string }>('/accounts/qobuz/import-cookie', {
      method: 'POST',
      body: { input, label, id },
    }),

  // Settings
  getSettings: () => request<AppSettings>('/settings'),

  updateSettings: (settings: Partial<AppSettings>) =>
    request<AppSettings>('/settings', { method: 'PUT', body: settings }),

  browseDirectory: (currentPath?: string, title?: string) =>
    request<{ path?: string; canceled: boolean }>('/settings/browse-folder', {
      method: 'POST',
      body: { currentPath, title },
    }),

  // MP3 Collection Management
  scanLocalDirectory: (directory?: string) =>
    request<ScanDirectoryResult>('/mp3/scan', { method: 'POST', body: { directory } }),

  createDjSet: (req: CreateDjSetRequest) =>
    request<CreateDjSetResult>('/mp3/create-dj-set', { method: 'POST', body: req }),

  deleteTracks: (filePaths: string[], sourceDirectory?: string) =>
    request<DeleteTracksResult>('/mp3/delete', { method: 'POST', body: { filePaths, sourceDirectory } }),

  listDjSets: async () => {
    try {
      return await request<DjSetItem[]>('/mp3/dj-sets');
    } catch {
      return [];
    }
  },

  analyzeTracks: (filePaths: string[], writeTags = false) =>
    request<AnalyzeTracksResponse>('/mp3/analyze', { method: 'POST', body: { filePaths, writeTags } }),

  // Job-based analysis. Work continues server-side if the page reloads, and can be canceled.
  startAnalysisJob: (filePaths: string[], writeTags = false) =>
    request<AnalysisJob & { mode: string; concurrency: number }>('/mp3/analyze-jobs', {
      method: 'POST',
      body: { filePaths, writeTags },
    }),

  getAnalysisJob: (jobId: string) => request<AnalysisJob>(`/mp3/analyze-jobs/${jobId}`),

  cancelAnalysisJob: (jobId: string) =>
    request<{ success: boolean }>(`/mp3/analyze-jobs/${jobId}`, { method: 'DELETE' }),

  /**
   * Subscribes to a running analysis job. Returns an unsubscribe function.
   *
   * EventSource cannot set headers, so this is a plain GET; the server only enforces the session
   * token on mutating methods, and the job id is unguessable.
   */
  observeAnalysisJob(
    jobId: string,
    onProgress: (progress: AnalysisProgress) => void
  ): () => void {
    const source = new EventSource(`${API_BASE}/mp3/analyze-jobs/${jobId}/events`);

    source.onmessage = (event) => {
      try {
        onProgress(JSON.parse(event.data));
      } catch {
        // Heartbeat or non-JSON frame.
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  },

  /**
   * Runs a batch and resolves when it finishes. Built on the job API so the work is cancellable
   * and runs in the worker pool.
   */
  async analyzeTracksStream(
    filePaths: string[],
    writeTags = false,
    onProgress?: (progress: AnalysisProgress) => void
  ): Promise<AnalyzeTracksResponse & { jobId: string }> {
    const job = await this.startAnalysisJob(filePaths, writeTags);

    return new Promise((resolve, reject) => {
      const unsubscribe = this.observeAnalysisJob(job.id, (progress) => {
        onProgress?.(progress);

        if (progress.type === 'complete' || progress.type === 'canceled') {
          unsubscribe();
          resolve({
            jobId: job.id,
            results: progress.results || [],
            processedCount: progress.current,
            successCount: (progress.results || []).filter((r) => r.bpm !== null && r.camelotKey !== null).length,
          });
        } else if (progress.type === 'failed') {
          unsubscribe();
          reject(new Error(progress.error || 'Analysis failed'));
        }
      });
    });
  },

  getArtworkUrl: (filePath: string) => `${API_BASE}/mp3/artwork?path=${encodeURIComponent(filePath)}`,

  getStreamUrl: (filePath: string) => `${API_BASE}/mp3/stream?path=${encodeURIComponent(filePath)}`,

  // Converter
  previewConverterUrl: (url: string, accountId?: string) =>
    request<{
      service: ServiceType;
      type: 'track' | 'album' | 'playlist';
      title: string;
      artist?: string;
      coverUrl?: string;
      tracks: TrackItem[];
    }>('/convert/preview', { method: 'POST', body: { url, accountId } }),

  getUserPlaylists: (service: ServiceType, accountId?: string) => {
    const params = new URLSearchParams({ service });
    if (accountId) params.append('accountId', accountId);
    return request<PlaylistSummary[]>(`/convert/playlists?${params.toString()}`);
  },

  matchTracks: (
    tracks: TrackItem[],
    targetService: ServiceType,
    targetAccountId?: string,
    options?: MatchOptions
  ) =>
    request<{ total: number; matched: number; missed: number; matchRate: number; matches: TrackMatch[] }>(
      '/convert/match',
      { method: 'POST', body: { tracks, targetService, targetAccountId, options } }
    ),

  syncToTarget: (
    targetService: ServiceType,
    targetAccountId: string | undefined,
    targetPlaylistId: string | undefined,
    targetPlaylistName: string | undefined,
    isNewPlaylist: boolean,
    matches: TrackMatch[]
  ) =>
    request<{ success: boolean; playlistId: string; playlistTitle: string; addedTracksCount: number }>(
      '/convert/sync',
      {
        method: 'POST',
        body: { targetService, targetAccountId, targetPlaylistId, targetPlaylistName, isNewPlaylist, matches },
      }
    ),

  // Downloader
  previewDownloadUrl: (url: string) =>
    request<{
      type: 'track' | 'album' | 'playlist';
      title: string;
      artist?: string;
      coverUrl?: string;
      tracks: TrackItem[];
    }>('/download/preview', { method: 'POST', body: { url } }),

  enqueueDownloads: (
    tracks: TrackItem[],
    quality?: QualityId,
    downloadDir?: string,
    playlistTitle?: string,
    createM3u?: boolean
  ) =>
    request<{ enqueuedCount: number; items: DownloadItemProgress[] }>('/download/enqueue', {
      method: 'POST',
      body: { tracks, quality, downloadDir, playlistTitle, createM3u },
    }),

  getDownloadQueue: () => request<DownloadItemProgress[]>('/download/queue'),

  clearCompletedDownloads: () =>
    request<{ success: boolean; queue: DownloadItemProgress[] }>('/download/clear', {
      method: 'POST',
      body: {},
    }),
};

export { streamHeaders };

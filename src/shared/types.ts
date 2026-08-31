export type ServiceType = 'qobuz' | 'spotify';

export type QualityId = 5 | 6 | 7 | 27; // 5: MP3 320, 6: FLAC 16/44.1, 7: FLAC 24/<=96, 27: FLAC 24/>96

/** Account as sent to the client: credential values are replaced by presence flags. */
export interface RedactedAccount {
  id: string;
  service: ServiceType;
  label: string;
  email?: string;
  username?: string;
  avatarUrl?: string;
  isActive: boolean;
  credentialSummary: {
    qobuz?: { hasUserAuthToken: boolean; tokenHint?: string; hasPassword: boolean };
    spotify?: { hasClientId: boolean; clientIdHint?: string; hasClientSecret: boolean; hasAccessToken: boolean };
  };
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  service: ServiceType;
  label: string;
  email?: string;
  username?: string;
  avatarUrl?: string;
  isActive: boolean;
  credentials: {
    qobuz?: {
      email?: string;
      password?: string;
      appId?: string;
      userAuthToken?: string;
      secret?: string;
    };
    spotify?: {
      clientId?: string;
      clientSecret?: string;
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: number;
    };
  };
  createdAt: string;
  updatedAt: string;
}

export interface TrackItem {
  id: string;
  service: ServiceType;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  isrc?: string;
  year?: string;
  trackNumber?: number;
  coverUrl?: string;
  sourceUrl?: string;
  quality?: string;
  raw?: Record<string, unknown>;
}

export interface PlaylistSummary {
  id: string;
  service: ServiceType;
  title: string;
  description?: string;
  ownerName?: string;
  trackCount: number;
  coverUrl?: string;
  url: string;
}

export type MatchStatus = 'exact' | 'high_confidence' | 'fuzzy' | 'miss';

export interface TrackMatch {
  sourceTrack: TrackItem;
  targetTrack?: TrackItem;
  status: MatchStatus;
  confidenceScore: number; // 0 - 100
  reason?: string;
}

export interface ConversionJob {
  id: string;
  sourceUrl: string;
  sourceService: ServiceType;
  sourceAccountId?: string;
  targetService: ServiceType;
  targetAccountId: string;
  targetPlaylistId?: string;
  targetPlaylistName?: string;
  status: 'idle' | 'fetching_source' | 'matching' | 'exporting' | 'completed' | 'failed';
  totalTracks: number;
  matchedTracks: number;
  missedTracks: number;
  matches: TrackMatch[];
  progressPercent: number;
  error?: string;
  createdAt: string;
}

export interface DownloadItemProgress {
  id: string;
  track: TrackItem;
  status: 'queued' | 'downloading' | 'tagging' | 'completed' | 'failed' | 'skipped';
  progressPercent: number;
  speedBps?: number;
  targetPath?: string;
  error?: string;
}

export interface AppSettings {
  defaultDownloadDir: string;
  defaultLibraryDir: string;
  defaultQuality: QualityId;
  embedArtwork: boolean;
  createM3u: boolean;
  folderFormat: string;
  trackFormat: string;
  djMode: boolean;
}

export interface LocalTrackItem {
  id: string;
  filePath: string;
  fileName: string;
  relativeSubPath: string;
  fileSize: number;
  extension: string;
  title: string;
  artist: string;
  album: string;
  year?: number | string;
  trackNumber?: number;
  durationSec?: number;
  bpm?: number;
  key?: string;
  bitrate?: number;
  sampleRate?: number;
  lossless?: boolean;
  hasArtwork: boolean;
}

export interface ScanDirectoryResult {
  directory: string;
  totalFiles: number;
  tracks: LocalTrackItem[];
  scannedAt: string;
}

export interface CreateDjSetRequest {
  sourceDirectory?: string;
  targetDirectory?: string;
  sessionName: string;
  trackPaths?: string[];
  copyMode?: boolean; // false = move (default), true = copy
  cleanEmptyFolders?: boolean;
}

export interface DjSetItem {
  id: string;
  name: string;
  path: string;
  trackCount: number;
  createdAt: string;
}

export interface CreateDjSetResult {
  success: boolean;
  sessionName: string;
  targetDirectory: string;
  totalRequested: number;
  processedCount: number;
  failedCount: number;
  copyMode: boolean;
  errors: { filePath: string; error: string }[];
}

export interface DeleteTracksResult {
  success: boolean;
  deletedCount: number;
  errors: { filePath: string; error: string }[];
}

export interface AudioAnalysisResult {
  filePath: string;
  bpm: number | null;
  key: string | null;
  camelotKey: string | null;
  confidence: number;
  tagsWritten: boolean;
  /** Detection succeeded but scored too low to be written to disk. */
  lowConfidence?: boolean;
  error?: string;
}

export type AnalysisJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

export interface AnalysisJob {
  id: string;
  status: AnalysisJobStatus;
  total: number;
  completed: number;
  successCount: number;
  writeTags: boolean;
  currentFile?: string;
  results: AudioAnalysisResult[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface AnalyzeTracksRequest {
  filePaths: string[];
  writeTags?: boolean;
}

export interface AnalyzeTracksResponse {
  results: AudioAnalysisResult[];
  processedCount: number;
  successCount: number;
}


export interface AuthTestResult {
  success: boolean;
  service: ServiceType;
  message: string;
  details?: {
    username?: string;
    subscription?: string;
    maxQuality?: string;
  };
}

export interface MatchOptions {
  durationToleranceSec: number;
  strictIsrcOnly: boolean;
  minConfidenceScore: number;
}

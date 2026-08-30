export type ServiceType = 'qobuz' | 'spotify';

export type QualityId = 5 | 6 | 7 | 27; // 5: MP3 320, 6: FLAC 16/44.1, 7: FLAC 24/<=96, 27: FLAC 24/>96

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
  defaultQuality: QualityId;
  embedArtwork: boolean;
  createM3u: boolean;
  folderFormat: string;
  trackFormat: string;
  djMode: boolean;
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

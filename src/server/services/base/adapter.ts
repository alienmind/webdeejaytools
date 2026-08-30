import { AuthTestResult, PlaylistSummary, QualityId, ServiceType, TrackItem } from '../../../shared/types.js';

export interface ParsedResource {
  type: 'track' | 'album' | 'playlist' | 'artist';
  id: string;
}

export interface ServiceAlbumResult {
  album: {
    id: string;
    title: string;
    artist: string;
    coverUrl?: string;
    releaseDate?: string;
    trackCount: number;
  };
  tracks: TrackItem[];
}

export interface ServicePlaylistResult {
  playlist: PlaylistSummary;
  tracks: TrackItem[];
}

export interface StreamUrlResult {
  url: string;
  formatId: QualityId;
  mimeType: string;
  samplingRate?: number;
  bitDepth?: number;
}

/**
 * Universal interface for all music service providers (Qobuz, Spotify, Tidal, Deezer, Beatport, etc.)
 */
export interface IMusicService {
  readonly service: ServiceType;
  readonly name: string;
  readonly canDownload: boolean;

  /**
   * Parse a service URL or identifier into a standard resource descriptor
   */
  parseUrl(url: string): ParsedResource | null;

  /**
   * Metadata fetching
   */
  getTrack(id: string, authContext?: any): Promise<TrackItem>;
  getAlbum(id: string, authContext?: any): Promise<ServiceAlbumResult>;
  getPlaylist(id: string, authContext?: any): Promise<ServicePlaylistResult>;

  /**
   * Catalog search
   */
  searchTracks(query: string, limit?: number, authContext?: any): Promise<TrackItem[]>;

  /**
   * User Playlist Management
   */
  getUserPlaylists(authContext?: any): Promise<PlaylistSummary[]>;
  createPlaylist(title: string, authContext?: any, isPublic?: boolean, description?: string): Promise<PlaylistSummary>;
  addTracksToPlaylist(playlistId: string, trackIdentifiers: string[], authContext?: any): Promise<boolean>;

  /**
   * Credential verification & connection diagnostic test
   */
  testConnection(credentials: any): Promise<AuthTestResult>;

  /**
   * Direct streaming URL for local downloading (if supported by service)
   */
  getStreamUrl?(trackId: string, quality?: QualityId, authContext?: any): Promise<StreamUrlResult>;
}

import { AuthTestResult, PlaylistSummary, QualityId, ServiceType, TrackItem } from '../../../shared/types.js';
import { IMusicService, ParsedResource, ServiceAlbumResult, ServicePlaylistResult, StreamUrlResult } from '../base/adapter.js';
import { QobuzClient } from './client.js';

export class QobuzServiceAdapter implements IMusicService {
  public readonly service: ServiceType = 'qobuz';
  public readonly name = 'Qobuz';
  public readonly canDownload = true;

  private getClient(authContext?: any): QobuzClient {
    const creds = authContext?.credentials?.qobuz || authContext?.credentials || {};
    return new QobuzClient(creds.appId, creds.secret);
  }

  private getToken(authContext?: any): string | undefined {
    return authContext?.credentials?.qobuz?.userAuthToken || authContext?.userAuthToken;
  }

  public parseUrl(url: string): ParsedResource | null {
    const client = new QobuzClient();
    return client.parseUrl(url);
  }

  public async getTrack(id: string, authContext?: any): Promise<TrackItem> {
    const client = this.getClient(authContext);
    const token = this.getToken(authContext);
    return client.getTrack(id, token);
  }

  public async getAlbum(id: string, authContext?: any): Promise<ServiceAlbumResult> {
    const client = this.getClient(authContext);
    const token = this.getToken(authContext);
    const result = await client.getAlbum(id, token);
    return {
      album: {
        id: result.album.id,
        title: result.album.title,
        artist: result.album.artist,
        coverUrl: result.album.coverUrl,
        releaseDate: result.album.releaseDate,
        trackCount: result.album.trackCount,
      },
      tracks: result.tracks,
    };
  }

  public async getPlaylist(id: string, authContext?: any): Promise<ServicePlaylistResult> {
    const client = this.getClient(authContext);
    const token = this.getToken(authContext);
    return client.getPlaylist(id, token);
  }

  public async searchTracks(query: string, limit = 10, authContext?: any): Promise<TrackItem[]> {
    const client = this.getClient(authContext);
    const token = this.getToken(authContext);
    return client.searchTracks(query, limit, token);
  }

  public async getUserPlaylists(authContext?: any): Promise<PlaylistSummary[]> {
    const token = this.getToken(authContext);
    if (!token) {
      throw new Error('Qobuz user authentication token is required to fetch user playlists.');
    }
    const client = this.getClient(authContext);
    return client.getUserPlaylists(token);
  }

  public async createPlaylist(title: string, authContext?: any, isPublic = false): Promise<PlaylistSummary> {
    const token = this.getToken(authContext);
    if (!token) {
      throw new Error('Qobuz user authentication token is required to create a playlist.');
    }
    const client = this.getClient(authContext);
    return client.createPlaylist(title, token, isPublic);
  }

  public async addTracksToPlaylist(playlistId: string, trackIdentifiers: string[], authContext?: any): Promise<boolean> {
    const token = this.getToken(authContext);
    if (!token) {
      throw new Error('Qobuz user authentication token is required to add tracks.');
    }
    const client = this.getClient(authContext);
    return client.addTracksToPlaylist(playlistId, trackIdentifiers, token);
  }

  public async testConnection(credentials: any): Promise<AuthTestResult> {
    const qobuzCreds = credentials?.qobuz || credentials || {};
    const { email, password, userAuthToken, appId, secret } = qobuzCreds;

    try {
      const client = new QobuzClient(appId, secret);

      if (userAuthToken) {
        const user = await client.getUser(userAuthToken);
        return {
          success: true,
          service: 'qobuz',
          message: `Connected via user auth token as ${user.display_name || user.email}`,
          details: {
            username: user.display_name,
            subscription: user.subscription,
          },
        };
      }

      if (!email || !password) {
        return {
          success: false,
          service: 'qobuz',
          message: 'Provide either Email & Password or User Auth Token.',
        };
      }

      const auth = await client.login(email, password);
      return {
        success: true,
        service: 'qobuz',
        message: `Successfully authenticated with Qobuz as ${auth.display_name || auth.email}`,
        details: {
          username: auth.display_name,
          subscription: auth.subscription,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        service: 'qobuz',
        message: err.message || 'Qobuz connection test failed',
      };
    }
  }

  public async getStreamUrl(trackId: string, quality: QualityId = 6, authContext?: any): Promise<StreamUrlResult> {
    const client = this.getClient(authContext);
    const token = this.getToken(authContext);
    return client.getFileUrl(trackId, quality, token);
  }
}

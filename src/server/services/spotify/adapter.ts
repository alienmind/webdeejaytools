import { AuthTestResult, PlaylistSummary, QualityId, ServiceType, TrackItem } from '../../../shared/types.js';
import { IMusicService, ParsedResource, ServiceAlbumResult, ServicePlaylistResult, StreamUrlResult } from '../base/adapter.js';
import { SpotifyClient } from './client.js';

export class SpotifyServiceAdapter implements IMusicService {
  public readonly service: ServiceType = 'spotify';
  public readonly name = 'Spotify';
  public readonly canDownload = false;

  private getClient(authContext?: any): SpotifyClient {
    const creds = authContext?.credentials?.spotify || authContext?.credentials || {};
    return new SpotifyClient(creds.clientId, creds.clientSecret);
  }

  private getToken(authContext?: any): string | undefined {
    return authContext?.credentials?.spotify?.accessToken || authContext?.accessToken;
  }

  public parseUrl(url: string): ParsedResource | null {
    const client = new SpotifyClient();
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
      throw new Error('Spotify user OAuth access token is required to fetch user playlists.');
    }
    const client = this.getClient(authContext);
    return client.getUserPlaylists(token);
  }

  public async createPlaylist(title: string, authContext?: any, isPublic = false, description?: string): Promise<PlaylistSummary> {
    const token = this.getToken(authContext);
    if (!token) {
      throw new Error('Spotify user OAuth access token is required to create playlists.');
    }
    const client = this.getClient(authContext);
    const user = await client.getCurrentUser(token);
    return client.createPlaylist(user.id, title, token, isPublic, description);
  }

  public async addTracksToPlaylist(playlistId: string, trackIdentifiers: string[], authContext?: any): Promise<boolean> {
    const token = this.getToken(authContext);
    if (!token) {
      throw new Error('Spotify user OAuth access token is required to modify playlists.');
    }
    const client = this.getClient(authContext);
    return client.addTracksToPlaylist(playlistId, trackIdentifiers, token);
  }

  public async testConnection(credentials: any): Promise<AuthTestResult> {
    const spotifyCreds = credentials?.spotify || credentials || {};
    const { clientId, clientSecret, accessToken } = spotifyCreds;
    const client = new SpotifyClient(clientId, clientSecret);

    try {
      if (accessToken) {
        const user = await client.getCurrentUser(accessToken);
        return {
          success: true,
          service: 'spotify',
          message: `Successfully connected with Spotify user account: ${user.displayName}`,
          details: {
            username: user.displayName,
            subscription: user.product,
          },
        };
      }

      if (clientId && clientSecret) {
        const token = await client.getClientCredentialsToken();
        if (token) {
          return {
            success: true,
            service: 'spotify',
            message: 'Successfully authenticated with Spotify Developer Client Credentials (Catalog Access OK).',
          };
        }
      }

      return {
        success: false,
        service: 'spotify',
        message: 'Provide either Client ID + Client Secret or User Access Token.',
      };
    } catch (err: any) {
      return {
        success: false,
        service: 'spotify',
        message: err.message || 'Spotify connection test failed',
      };
    }
  }

  public async getStreamUrl(_trackId: string, _quality?: QualityId, _authContext?: any): Promise<StreamUrlResult> {
    throw new Error('Spotify does not support direct stream file downloading. Use Qobuz as download source.');
  }
}

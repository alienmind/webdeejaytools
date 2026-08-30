import crypto from 'crypto';
import { generateRequestSignature } from './signer.js';
import { getQobuzBundleSecrets } from './bundle.js';
import { PlaylistSummary, QualityId, TrackItem } from '../../../shared/types.js';

export interface QobuzAuthResponse {
  userAuthToken: string;
  userId: number;
  email: string;
  display_name?: string;
  subscription?: string;
}

export class QobuzClient {
  private baseUrl = 'https://www.qobuz.com/api.json/0.2';
  private appId?: string;
  private secret?: string;

  constructor(appId?: string, secret?: string) {
    this.appId = appId;
    this.secret = secret;
  }

  private async getCredentials(): Promise<{ appId: string; secret: string }> {
    if (this.appId && this.secret) {
      return { appId: this.appId, secret: this.secret };
    }
    const bundle = await getQobuzBundleSecrets();
    return {
      appId: this.appId || bundle.appId,
      secret: this.secret || bundle.secrets.track_getFileUrl || bundle.secrets.base || '2f06ffea4eb2f84ebaa503577d61184a',
    };
  }

  public parseUrl(url: string): { type: 'track' | 'album' | 'playlist' | 'artist'; id: string } | null {
    const trimmed = url.trim();
    // Handle raw numeric or alphanumeric IDs if passed directly
    if (/^\d+$/.test(trimmed)) {
      return { type: 'track', id: trimmed };
    }

    try {
      const parsed = new URL(trimmed);
      if (!parsed.hostname.includes('qobuz.com')) {
        return null;
      }

      const parts = parsed.pathname.split('/').filter(Boolean);

      for (let i = 0; i < parts.length; i++) {
        const seg = parts[i].toLowerCase();
        if (['track', 'album', 'playlist', 'artist'].includes(seg) && parts[i + 1]) {
          return {
            type: seg as 'track' | 'album' | 'playlist' | 'artist',
            id: parts[i + 1].split('?')[0],
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  public async login(email: string, password: string): Promise<QobuzAuthResponse> {
    const { appId } = await this.getCredentials();
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    // 1. Try plaintext password
    let result = await this.performLoginRequest(cleanEmail, cleanPassword, appId);
    if (result.success && result.data) {
      return result.data;
    }

    // 2. Try MD5-hashed password
    const md5Password = crypto.createHash('md5').update(cleanPassword).digest('hex');
    result = await this.performLoginRequest(cleanEmail, md5Password, appId);
    if (result.success && result.data) {
      return result.data;
    }

    throw new Error('Invalid Qobuz email or password. Please verify your credentials, or copy your user_auth_token from play.qobuz.com DevTools.');
  }

  private async performLoginRequest(username: string, passwordVal: string, appId: string): Promise<{ success: boolean; data?: QobuzAuthResponse; error?: string }> {
    try {
      const params = new URLSearchParams({
        username,
        email: username,
        password: passwordVal,
        app_id: appId,
        extra: 'credential',
      });

      const res = await fetch(`${this.baseUrl}/user/login?${params.toString()}`, {
        method: 'GET',
        headers: {
          'X-App-Id': appId,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const data = await res.json();
      if (!res.ok || data.status === 'error' || !data.user_auth_token) {
        return { success: false, error: data.message || 'Login failed' };
      }

      return {
        success: true,
        data: {
          userAuthToken: data.user_auth_token,
          userId: data.user?.id,
          email: data.user?.email || username,
          display_name: data.user?.display_name || data.user?.login,
          subscription: data.user?.credential?.description || data.user?.credential?.label || 'Active',
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async getUser(userAuthToken: string): Promise<QobuzAuthResponse> {
    const { appId } = await this.getCredentials();
    const params = new URLSearchParams({
      app_id: appId,
      extra: 'partner',
    });

    const res = await fetch(`${this.baseUrl}/user/login?${params.toString()}`, {
      method: 'GET',
      headers: {
        'X-App-Id': appId,
        'X-User-Auth-Token': userAuthToken,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const data = await res.json();
    if (!res.ok || data.status === 'error' || !data.user) {
      throw new Error(data.message || 'Invalid or expired Qobuz user auth token');
    }

    return {
      userAuthToken,
      userId: data.user?.id,
      email: data.user?.email || '',
      display_name: data.user?.display_name || data.user?.login,
      subscription: data.user?.credential?.description || data.user?.credential?.label || 'Active',
    };
  }

  public async getTrack(trackId: string | number, userAuthToken?: string): Promise<TrackItem> {
    const { appId } = await this.getCredentials();
    const params = new URLSearchParams({
      track_id: String(trackId),
      app_id: appId,
    });

    const headers: Record<string, string> = { 'X-App-Id': appId };
    if (userAuthToken) {
      headers['X-User-Auth-Token'] = userAuthToken;
    }

    const res = await fetch(`${this.baseUrl}/track/get?${params.toString()}`, { headers });
    const data = await res.json();
    if (!res.ok || !data || data.status === 'error') {
      throw new Error(data.message || `Failed to fetch Qobuz track ${trackId}`);
    }

    return this.normalizeTrack(data);
  }

  public async getAlbum(albumId: string, userAuthToken?: string): Promise<{ album: Record<string, any>; tracks: TrackItem[] }> {
    const { appId } = await this.getCredentials();
    const params = new URLSearchParams({
      album_id: albumId,
      app_id: appId,
    });

    const headers: Record<string, string> = { 'X-App-Id': appId };
    if (userAuthToken) {
      headers['X-User-Auth-Token'] = userAuthToken;
    }

    const res = await fetch(`${this.baseUrl}/album/get?${params.toString()}`, { headers });
    const data = await res.json();
    if (!res.ok || !data || data.status === 'error') {
      throw new Error(data.message || `Failed to fetch Qobuz album ${albumId}`);
    }

    const tracksList = data.tracks?.items || [];
    const tracks = tracksList.map((t: any) => this.normalizeTrack(t, data));

    return {
      album: {
        id: data.id,
        title: data.title,
        artist: data.artist?.name || 'Unknown Artist',
        coverUrl: data.image?.large || data.image?.small || data.image?.thumbnail,
        releaseDate: data.release_date_original || data.released_at,
        trackCount: data.tracks_count || tracks.length,
      },
      tracks,
    };
  }

  public async getPlaylist(playlistId: string | number, userAuthToken?: string): Promise<{ playlist: PlaylistSummary; tracks: TrackItem[] }> {
    const { appId } = await this.getCredentials();
    const params = new URLSearchParams({
      playlist_id: String(playlistId),
      extra: 'tracks',
      limit: '500',
      app_id: appId,
    });

    const headers: Record<string, string> = { 'X-App-Id': appId };
    if (userAuthToken) {
      headers['X-User-Auth-Token'] = userAuthToken;
    }

    const res = await fetch(`${this.baseUrl}/playlist/get?${params.toString()}`, { headers });
    const data = await res.json();
    if (!res.ok || !data || data.status === 'error') {
      throw new Error(data.message || `Failed to fetch Qobuz playlist ${playlistId}`);
    }

    const items = data.tracks?.items || [];
    const tracks = items.map((t: any) => this.normalizeTrack(t));

    return {
      playlist: {
        id: String(data.id),
        service: 'qobuz',
        title: data.title || 'Untitled Playlist',
        description: data.description,
        ownerName: data.owner?.name,
        trackCount: data.tracks_count || tracks.length,
        coverUrl: data.images300?.[0] || data.image_rectangle?.[0] || data.images150?.[0],
        url: `https://play.qobuz.com/playlist/${data.id}`,
      },
      tracks,
    };
  }

  public async searchTracks(query: string, limit = 10, userAuthToken?: string): Promise<TrackItem[]> {
    const { appId } = await this.getCredentials();
    const params = new URLSearchParams({
      query,
      limit: String(limit),
      app_id: appId,
    });

    const headers: Record<string, string> = { 'X-App-Id': appId };
    if (userAuthToken) {
      headers['X-User-Auth-Token'] = userAuthToken;
    }

    const res = await fetch(`${this.baseUrl}/track/search?${params.toString()}`, { headers });
    const data = await res.json();
    if (!res.ok || !data || data.status === 'error') {
      return [];
    }

    const items = data.tracks?.items || [];
    return items.map((t: any) => this.normalizeTrack(t));
  }

  public async getUserPlaylists(userAuthToken: string): Promise<PlaylistSummary[]> {
    const { appId } = await this.getCredentials();
    const params = new URLSearchParams({
      app_id: appId,
      limit: '100',
    });

    const res = await fetch(`${this.baseUrl}/playlist/getUserPlaylists?${params.toString()}`, {
      headers: {
        'X-App-Id': appId,
        'X-User-Auth-Token': userAuthToken,
      },
    });

    const data = await res.json();
    if (!res.ok || !data || data.status === 'error') {
      return [];
    }

    const playlists = data.playlists?.items || [];
    return playlists.map((p: any) => ({
      id: String(p.id),
      service: 'qobuz',
      title: p.title,
      description: p.description,
      ownerName: p.owner?.name,
      trackCount: p.tracks_count || 0,
      coverUrl: p.images300?.[0] || p.images150?.[0],
      url: `https://play.qobuz.com/playlist/${p.id}`,
    }));
  }

  public async createPlaylist(title: string, userAuthToken: string, isPublic = false): Promise<PlaylistSummary> {
    const { appId } = await this.getCredentials();
    const params = new URLSearchParams({
      app_id: appId,
      title,
      is_public: isPublic ? 'true' : 'false',
    });

    const res = await fetch(`${this.baseUrl}/playlist/create?${params.toString()}`, {
      method: 'POST',
      headers: {
        'X-App-Id': appId,
        'X-User-Auth-Token': userAuthToken,
      },
    });

    const data = await res.json();
    if (!res.ok || !data || data.status === 'error') {
      throw new Error(data.message || 'Failed to create Qobuz playlist');
    }

    return {
      id: String(data.id),
      service: 'qobuz',
      title: data.title || title,
      trackCount: 0,
      url: `https://play.qobuz.com/playlist/${data.id}`,
    };
  }

  public async addTracksToPlaylist(playlistId: string | number, trackIds: (string | number)[], userAuthToken: string): Promise<boolean> {
    const { appId } = await this.getCredentials();
    const params = new URLSearchParams({
      app_id: appId,
      playlist_id: String(playlistId),
      track_ids: trackIds.join(','),
    });

    const res = await fetch(`${this.baseUrl}/playlist/addTracks?${params.toString()}`, {
      method: 'POST',
      headers: {
        'X-App-Id': appId,
        'X-User-Auth-Token': userAuthToken,
      },
    });

    const data = await res.json();
    return res.ok && data.status !== 'error';
  }

  public async getFileUrl(
    trackId: string | number,
    formatId: QualityId = 6,
    userAuthToken?: string
  ): Promise<{ url: string; formatId: QualityId; mimeType: string; samplingRate?: number; bitDepth?: number }> {
    const { appId, secret } = await this.getCredentials();
    const requestTs = Math.floor(Date.now() / 1000).toString();

    const signParams: Record<string, string | number> = {
      format_id: formatId,
      intent: 'stream',
      track_id: trackId,
    };

    const signature = generateRequestSignature('track/getFileUrl', signParams, requestTs, secret);

    const query = new URLSearchParams({
      app_id: appId,
      format_id: String(formatId),
      intent: 'stream',
      request_ts: requestTs,
      request_sig: signature,
      track_id: String(trackId),
    });

    const headers: Record<string, string> = { 'X-App-Id': appId };
    if (userAuthToken) {
      headers['X-User-Auth-Token'] = userAuthToken;
    }

    const res = await fetch(`${this.baseUrl}/track/getFileUrl?${query.toString()}`, { headers });
    const data = await res.json();

    if (!res.ok || !data.url) {
      throw new Error(data.message || data.error || `Unable to obtain streaming URL for track ${trackId}`);
    }

    return {
      url: data.url,
      formatId: data.format_id || formatId,
      mimeType: data.mime_type || (formatId === 5 ? 'audio/mpeg' : 'audio/flac'),
      samplingRate: data.sampling_rate,
      bitDepth: data.bit_depth,
    };
  }

  private normalizeTrack(raw: any, parentAlbum?: any): TrackItem {
    const albumObj = raw.album || parentAlbum || {};
    const coverUrl =
      albumObj.image?.large ||
      albumObj.image?.small ||
      albumObj.image?.thumbnail ||
      raw.image?.large ||
      raw.image?.small;

    return {
      id: String(raw.id),
      service: 'qobuz',
      title: raw.title || 'Unknown Title',
      artist: raw.performer?.name || raw.artist?.name || albumObj.artist?.name || 'Unknown Artist',
      album: albumObj.title || 'Unknown Album',
      durationMs: (raw.duration || 0) * 1000,
      isrc: raw.isrc || undefined,
      year: (albumObj.release_date_original || albumObj.released_at || raw.release_date_original || '')
        .substring(0, 4) || undefined,
      trackNumber: raw.track_number || 1,
      coverUrl,
      sourceUrl: `https://play.qobuz.com/track/${raw.id}`,
      quality: raw.maximum_bit_depth ? `${raw.maximum_bit_depth}-bit / ${raw.maximum_sampling_rate}kHz` : undefined,
      raw,
    };
  }
}

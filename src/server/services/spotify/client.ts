import { PlaylistSummary, TrackItem } from '../../../shared/types.js';

interface SpotifyTokenCache {
  token: string;
  expiresAt: number;
}

export class SpotifyClient {
  private clientId?: string;
  private clientSecret?: string;
  private static tokenCache: Map<string, SpotifyTokenCache> = new Map();

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  public parseUrl(url: string): { type: 'track' | 'album' | 'playlist' | 'artist'; id: string } | null {
    try {
      const trimmed = url.trim();
      // Handle spotify:track:xxxx or spotify:album:xxxx
      if (trimmed.startsWith('spotify:')) {
        const parts = trimmed.split(':');
        if (parts.length >= 3 && ['track', 'album', 'playlist', 'artist'].includes(parts[1])) {
          return { type: parts[1] as any, id: parts[2] };
        }
      }

      // Handle https://open.spotify.com/track/xxxx?si=...
      const parsed = new URL(trimmed);
      if (!parsed.hostname.includes('spotify.com')) {
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

      // If alphanumeric 22 chars
      if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) {
        return { type: 'track', id: trimmed };
      }

      return null;
    } catch {
      return null;
    }
  }

  public async getClientCredentialsToken(): Promise<string> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Spotify Client ID and Client Secret are required for catalog access.');
    }

    const cacheKey = `${this.clientId}:${this.clientSecret}`;
    const cached = SpotifyClient.tokenCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt - 60000) {
      return cached.token;
    }

    const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || 'Failed to authenticate with Spotify API');
    }

    const token = data.access_token;
    const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    SpotifyClient.tokenCache.set(cacheKey, { token, expiresAt });

    return token;
  }

  public async getEffectiveToken(providedToken?: string): Promise<string> {
    if (providedToken) return providedToken;
    return this.getClientCredentialsToken();
  }

  public async getCurrentUser(userToken: string): Promise<{ id: string; displayName: string; email?: string; product?: string }> {
    const res = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to fetch Spotify current user');
    }

    return {
      id: data.id,
      displayName: data.display_name || data.id,
      email: data.email,
      product: data.product,
    };
  }

  public async getTrack(trackId: string, token?: string): Promise<TrackItem> {
    const authToken = await this.getEffectiveToken(token);
    const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Failed to fetch Spotify track ${trackId}`);
    }

    return this.normalizeTrack(data);
  }

  public async getAlbum(albumId: string, token?: string): Promise<{ album: Record<string, any>; tracks: TrackItem[] }> {
    const authToken = await this.getEffectiveToken(token);
    const res = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Failed to fetch Spotify album ${albumId}`);
    }

    const rawTracks = data.tracks?.items || [];
    const tracks = rawTracks.map((t: any) => this.normalizeTrack(t, data));

    return {
      album: {
        id: data.id,
        title: data.name,
        artist: data.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
        coverUrl: data.images?.[0]?.url,
        releaseDate: data.release_date,
        trackCount: data.total_tracks || tracks.length,
      },
      tracks,
    };
  }

  public async getPlaylist(playlistId: string, token?: string): Promise<{ playlist: PlaylistSummary; tracks: TrackItem[] }> {
    const authToken = await this.getEffectiveToken(token);
    const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Failed to fetch Spotify playlist ${playlistId}`);
    }

    const tracks: TrackItem[] = [];
    let nextUrl: string | null = data.tracks?.href || null;
    let items = data.tracks?.items || [];

    for (const item of items) {
      if (item?.track) {
        tracks.push(this.normalizeTrack(item.track));
      }
    }

    // Paginate if more tracks exist (up to 500 tracks safety cap)
    while (nextUrl && tracks.length < 500) {
      const pRes = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!pRes.ok) break;
      const pData = await pRes.json();
      const pItems = pData.items || [];
      for (const item of pItems) {
        if (item?.track) {
          tracks.push(this.normalizeTrack(item.track));
        }
      }
      nextUrl = pData.next;
    }

    return {
      playlist: {
        id: data.id,
        service: 'spotify',
        title: data.name || 'Untitled Playlist',
        description: data.description,
        ownerName: data.owner?.display_name || data.owner?.id,
        trackCount: data.tracks?.total || tracks.length,
        coverUrl: data.images?.[0]?.url,
        url: data.external_urls?.spotify || `https://open.spotify.com/playlist/${data.id}`,
      },
      tracks,
    };
  }

  public async searchTracks(query: string, limit = 10, token?: string): Promise<TrackItem[]> {
    const authToken = await this.getEffectiveToken(token);
    const params = new URLSearchParams({
      q: query,
      type: 'track',
      limit: String(limit),
    });

    const res = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const data = await res.json();
    if (!res.ok || !data.tracks?.items) {
      return [];
    }

    return data.tracks.items.map((t: any) => this.normalizeTrack(t));
  }

  public async getUserPlaylists(userToken: string): Promise<PlaylistSummary[]> {
    const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
      headers: { Authorization: `Bearer ${userToken}` },
    });

    const data = await res.json();
    if (!res.ok || !data.items) {
      return [];
    }

    return data.items.map((p: any) => ({
      id: p.id,
      service: 'spotify',
      title: p.name,
      description: p.description,
      ownerName: p.owner?.display_name,
      trackCount: p.tracks?.total || 0,
      coverUrl: p.images?.[0]?.url,
      url: p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`,
    }));
  }

  public async createPlaylist(userId: string, name: string, userToken: string, isPublic = false, description = ''): Promise<PlaylistSummary> {
    const res = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        public: isPublic,
        description: description || 'Created with WebDeeJayTools',
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to create Spotify playlist');
    }

    return {
      id: data.id,
      service: 'spotify',
      title: data.name,
      description: data.description,
      trackCount: 0,
      url: data.external_urls?.spotify || `https://open.spotify.com/playlist/${data.id}`,
    };
  }

  public async addTracksToPlaylist(playlistId: string, trackUris: string[], userToken: string): Promise<boolean> {
    // Spotify allows up to 100 tracks per request
    const chunkSize = 100;
    for (let i = 0; i < trackUris.length; i += chunkSize) {
      const chunk = trackUris.slice(i, i + chunkSize);
      const formattedUris = chunk.map((uri) => (uri.startsWith('spotify:track:') ? uri : `spotify:track:${uri}`));

      const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uris: formattedUris,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to add tracks to Spotify playlist');
      }
    }

    return true;
  }

  private normalizeTrack(raw: any, parentAlbum?: any): TrackItem {
    const albumObj = raw.album || parentAlbum || {};
    const coverUrl = albumObj.images?.[0]?.url || raw.album?.images?.[0]?.url;
    const artists = raw.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist';

    return {
      id: raw.id,
      service: 'spotify',
      title: raw.name || 'Unknown Title',
      artist: artists,
      album: albumObj.name || 'Unknown Album',
      durationMs: raw.duration_ms || 0,
      isrc: raw.external_ids?.isrc || undefined,
      year: (albumObj.release_date || '').substring(0, 4) || undefined,
      trackNumber: raw.track_number || 1,
      coverUrl,
      sourceUrl: raw.external_urls?.spotify || `https://open.spotify.com/track/${raw.id}`,
      raw,
    };
  }
}

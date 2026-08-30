import { describe, it, expect } from 'vitest';
import { serviceRegistry } from '../../src/server/services/registry.js';
import { IMusicService, ParsedResource, ServiceAlbumResult, ServicePlaylistResult } from '../../src/server/services/base/adapter.js';
import { AuthTestResult, PlaylistSummary, ServiceType, TrackItem } from '../../src/shared/types.js';

describe('ServiceRegistry & Common IMusicService Interface', () => {
  it('should have built-in Qobuz and Spotify adapters registered', () => {
    expect(serviceRegistry.has('qobuz')).toBe(true);
    expect(serviceRegistry.has('spotify')).toBe(true);
    expect(serviceRegistry.get('qobuz').name).toBe('Qobuz');
    expect(serviceRegistry.get('spotify').name).toBe('Spotify');
  });

  it('should resolve URLs across different music providers', () => {
    const qobuzUrl = 'https://play.qobuz.com/album/0001234567890';
    const resolvedQobuz = serviceRegistry.resolveUrl(qobuzUrl);
    expect(resolvedQobuz).toBeDefined();
    expect(resolvedQobuz?.adapter.service).toBe('qobuz');
    expect(resolvedQobuz?.parsed).toEqual({ type: 'album', id: '0001234567890' });

    const spotifyUrl = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
    const resolvedSpotify = serviceRegistry.resolveUrl(spotifyUrl);
    expect(resolvedSpotify).toBeDefined();
    expect(resolvedSpotify?.adapter.service).toBe('spotify');
    expect(resolvedSpotify?.parsed).toEqual({ type: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' });
  });

  it('should allow plug-and-play registration of a new music service (e.g. Tidal / MockService)', () => {
    // Implement mock provider
    const mockTidalAdapter: IMusicService = {
      service: 'tidal' as ServiceType,
      name: 'Tidal HiFi',
      canDownload: true,
      parseUrl(url: string): ParsedResource | null {
        if (url.includes('tidal.com/browse/track/')) {
          return { type: 'track', id: 'tidal_999' };
        }
        return null;
      },
      async getTrack(id: string): Promise<TrackItem> {
        return {
          id,
          service: 'tidal' as ServiceType,
          title: 'Tidal Master Track',
          artist: 'Tidal Artist',
          album: 'Tidal Album',
          durationMs: 200000,
        };
      },
      async getAlbum(): Promise<ServiceAlbumResult> {
        throw new Error('Not implemented');
      },
      async getPlaylist(): Promise<ServicePlaylistResult> {
        throw new Error('Not implemented');
      },
      async searchTracks(): Promise<TrackItem[]> {
        return [];
      },
      async getUserPlaylists(): Promise<PlaylistSummary[]> {
        return [];
      },
      async createPlaylist(): Promise<PlaylistSummary> {
        throw new Error('Not implemented');
      },
      async addTracksToPlaylist(): Promise<boolean> {
        return true;
      },
      async testConnection(): Promise<AuthTestResult> {
        return { success: true, service: 'tidal' as ServiceType, message: 'Tidal Mock Connected' };
      },
    };

    // Register dynamically
    serviceRegistry.register(mockTidalAdapter);

    expect(serviceRegistry.has('tidal' as ServiceType)).toBe(true);
    expect(serviceRegistry.get('tidal' as ServiceType).name).toBe('Tidal HiFi');

    const resolved = serviceRegistry.resolveUrl('https://tidal.com/browse/track/12345');
    expect(resolved?.adapter.service).toBe('tidal');
    expect(resolved?.parsed.id).toBe('tidal_999');
  });
});

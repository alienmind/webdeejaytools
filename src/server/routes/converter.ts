import { Hono } from 'hono';
import { store } from '../db/index.js';
import { serviceRegistry, findBestMatch, buildSearchQuery } from '../services/index.js';
import { MatchOptions, ServiceType, TrackItem, TrackMatch } from '../../shared/types.js';

const app = new Hono();

// Preview tracklist from URL using modular service adapters
app.post('/preview', async (c) => {
  const body = await c.req.json();
  const { url, accountId } = body;
  if (!url) {
    return c.json({ error: 'URL is required' }, 400);
  }

  try {
    const resolved = serviceRegistry.resolveUrl(url);
    if (!resolved) {
      return c.json({ error: 'Unsupported URL format across all registered music providers.' }, 400);
    }

    const { adapter, parsed } = resolved;
    const account = accountId ? store.getAccount(accountId) : store.getActiveAccount(adapter.service);

    if (parsed.type === 'track') {
      const track = await adapter.getTrack(parsed.id, account);
      return c.json({
        service: adapter.service,
        type: 'track',
        title: track.title,
        coverUrl: track.coverUrl,
        tracks: [track],
      });
    } else if (parsed.type === 'album') {
      const albumData = await adapter.getAlbum(parsed.id, account);
      return c.json({
        service: adapter.service,
        type: 'album',
        title: albumData.album.title,
        artist: albumData.album.artist,
        coverUrl: albumData.album.coverUrl,
        tracks: albumData.tracks,
      });
    } else if (parsed.type === 'playlist') {
      const plData = await adapter.getPlaylist(parsed.id, account);
      return c.json({
        service: adapter.service,
        type: 'playlist',
        title: plData.playlist.title,
        coverUrl: plData.playlist.coverUrl,
        tracks: plData.tracks,
      });
    }

    return c.json({ error: `Resource type '${parsed.type}' is not supported for conversion preview.` }, 400);
  } catch (err: any) {
    console.error('[Converter] Preview error:', err);
    return c.json({ error: err.message || 'Failed to resolve URL' }, 500);
  }
});

// Fetch user playlists on target service
app.get('/playlists', async (c) => {
  const service = c.req.query('service') as ServiceType;
  const accountId = c.req.query('accountId') as string;

  try {
    const account = accountId ? store.getAccount(accountId) : store.getActiveAccount(service);
    if (!account) {
      return c.json({ error: `No active ${service} account found.` }, 404);
    }

    const adapter = serviceRegistry.get(service);
    const playlists = await adapter.getUserPlaylists(account);
    return c.json(playlists);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to fetch playlists' }, 500);
  }
});

// Match source tracks to target service catalog
app.post('/match', async (c) => {
  const body = await c.req.json() as {
    tracks: TrackItem[];
    targetService: ServiceType;
    targetAccountId?: string;
    options?: MatchOptions;
  };
  const { tracks, targetService, targetAccountId, options } = body;

  if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
    return c.json({ error: 'Tracks array is required' }, 400);
  }

  try {
    const targetAdapter = serviceRegistry.get(targetService);
    const targetAccount = targetAccountId ? store.getAccount(targetAccountId) : store.getActiveAccount(targetService);

    const matches: TrackMatch[] = [];

    for (const track of tracks) {
      let candidates: TrackItem[] = [];

      // 1. Search target catalog
      const searchQuery = buildSearchQuery(track.artist, track.title);
      try {
        if (track.isrc) {
          const isrcResults = await targetAdapter.searchTracks(`isrc:${track.isrc}`, 5, targetAccount);
          candidates.push(...isrcResults);
        }
        if (candidates.length === 0) {
          const searchResults = await targetAdapter.searchTracks(searchQuery, 8, targetAccount);
          candidates.push(...searchResults);
        }
      } catch (searchErr) {
        console.warn(`[Converter] Search error on ${targetService} for ${track.title}:`, searchErr);
      }

      // 2. Evaluate candidates with matching engine
      const match = findBestMatch(track, candidates, options);
      matches.push(match);
    }

    const matchedCount = matches.filter((m) => m.status !== 'miss').length;
    const missedCount = matches.length - matchedCount;

    return c.json({
      total: matches.length,
      matched: matchedCount,
      missed: missedCount,
      matchRate: Math.round((matchedCount / matches.length) * 100),
      matches,
    });
  } catch (err: any) {
    console.error('[Converter] Matching error:', err);
    return c.json({ error: err.message || 'Matching process failed' }, 500);
  }
});

// Commit matched tracks to target playlist
app.post('/sync', async (c) => {
  const body = await c.req.json() as {
    targetService: ServiceType;
    targetAccountId?: string;
    targetPlaylistId?: string;
    targetPlaylistName?: string;
    isNewPlaylist?: boolean;
    matches: TrackMatch[];
  };
  const {
    targetService,
    targetAccountId,
    targetPlaylistId,
    targetPlaylistName,
    isNewPlaylist,
    matches,
  } = body;

  try {
    const targetAdapter = serviceRegistry.get(targetService);
    const targetAccount = targetAccountId ? store.getAccount(targetAccountId) : store.getActiveAccount(targetService);

    if (!targetAccount) {
      return c.json({ error: `Target ${targetService} account not found.` }, 404);
    }

    const successfulHits = matches.filter((m) => m.status !== 'miss' && m.targetTrack);
    if (successfulHits.length === 0) {
      return c.json({ error: 'No matched tracks to add to target playlist.' }, 400);
    }

    let finalPlaylistId = targetPlaylistId;
    let finalPlaylistTitle = targetPlaylistName;

    if (isNewPlaylist || !finalPlaylistId) {
      const created = await targetAdapter.createPlaylist(targetPlaylistName || 'WebDeeJayTools Playlist', targetAccount);
      finalPlaylistId = created.id;
      finalPlaylistTitle = created.title;
    }

    const trackIds = successfulHits.map((h) => h.targetTrack!.id);
    await targetAdapter.addTracksToPlaylist(finalPlaylistId, trackIds, targetAccount);

    return c.json({
      success: true,
      playlistId: finalPlaylistId,
      playlistTitle: finalPlaylistTitle,
      addedTracksCount: trackIds.length,
    });
  } catch (err: any) {
    console.error('[Converter] Sync error:', err);
    return c.json({ error: err.message || 'Failed to sync playlist' }, 500);
  }
});

export default app;

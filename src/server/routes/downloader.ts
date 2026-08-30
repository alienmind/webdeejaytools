import { Hono } from 'hono';
import { downloadQueue } from '../services/downloader/index.js';
import { store } from '../db/index.js';
import { serviceRegistry } from '../services/index.js';
import { QualityId, TrackItem } from '../../shared/types.js';

const app = new Hono();

// Preview tracklist from URL for downloading
app.post('/preview', async (c) => {
  const body = await c.req.json();
  const { url } = body;
  if (!url) {
    return c.json({ error: 'URL is required' }, 400);
  }

  try {
    const resolved = serviceRegistry.resolveUrl(url);
    if (!resolved) {
      return c.json({ error: 'Invalid or unsupported URL' }, 400);
    }

    const { adapter, parsed } = resolved;
    if (!adapter.canDownload) {
      return c.json({ error: `${adapter.name} does not support direct streaming/downloading. Please use Qobuz links.` }, 400);
    }

    const qobuzAccount = store.getActiveAccount(adapter.service);

    if (parsed.type === 'track') {
      const track = await adapter.getTrack(parsed.id, qobuzAccount);
      return c.json({
        type: 'track',
        title: track.title,
        artist: track.artist,
        coverUrl: track.coverUrl,
        tracks: [track],
      });
    } else if (parsed.type === 'album') {
      const albumData = await adapter.getAlbum(parsed.id, qobuzAccount);
      return c.json({
        type: 'album',
        title: albumData.album.title,
        artist: albumData.album.artist,
        coverUrl: albumData.album.coverUrl,
        tracks: albumData.tracks,
      });
    } else if (parsed.type === 'playlist') {
      const plData = await adapter.getPlaylist(parsed.id, qobuzAccount);
      return c.json({
        type: 'playlist',
        title: plData.playlist.title,
        coverUrl: plData.playlist.coverUrl,
        tracks: plData.tracks,
      });
    }

    return c.json({ error: 'Unsupported URL type' }, 400);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to preview audio item' }, 500);
  }
});

// Enqueue tracks to download
app.post('/enqueue', async (c) => {
  const body = await c.req.json() as {
    tracks: TrackItem[];
    quality?: QualityId;
    downloadDir?: string;
    playlistTitle?: string;
    createM3u?: boolean;
  };
  const { tracks, quality, downloadDir, playlistTitle, createM3u } = body;

  if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
    return c.json({ error: 'Tracks array is required' }, 400);
  }

  const enqueued = downloadQueue.enqueue({
    tracks,
    quality,
    downloadDir,
    playlistTitle,
    createM3u,
  });

  return c.json({
    enqueuedCount: enqueued.length,
    items: enqueued,
  });
});

// Get current queue
app.get('/queue', (c) => {
  return c.json(downloadQueue.getQueue());
});

// Clear completed items
app.post('/clear', (c) => {
  downloadQueue.clearCompleted();
  return c.json({ success: true, queue: downloadQueue.getQueue() });
});

export default app;

import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { store } from '../db/index.js';
import { scanLocalDirectory, getTrackArtwork } from '../services/mp3/scanner.js';
import { createDjSet, deleteTracks, listDjSets } from '../services/mp3/djset.js';
import { CreateDjSetRequest } from '../../shared/types.js';

const MIME_MAP: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.wma': 'audio/x-ms-wma',
};

const app = new Hono();

// List created/discovered DJ sets
app.get('/dj-sets', async (c) => {
  try {
    const sets = await listDjSets();
    return c.json(sets);
  } catch (err: any) {
    console.error('[API mp3/dj-sets] Error:', err);
    return c.json([], 200);
  }
});

// Scan directory for audio files recursively
app.post('/scan', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const settings = store.getSettings();
    const targetDir = body.directory || settings.defaultLibraryDir || settings.defaultDownloadDir;

    if (!targetDir) {
      return c.json({ error: 'No directory specified and no default configured' }, 400);
    }

    const result = await scanLocalDirectory(targetDir);
    return c.json(result);
  } catch (err: any) {
    console.error('[API mp3/scan] Error:', err);
    return c.json({ error: err.message || 'Failed to scan directory' }, 500);
  }
});

// Serve embedded artwork from audio file
app.get('/artwork', async (c) => {
  try {
    const filePath = c.req.query('path');
    if (!filePath) {
      return c.text('Missing path parameter', 400);
    }

    const artwork = await getTrackArtwork(filePath);
    if (!artwork) {
      return c.text('No embedded artwork found', 404);
    }

    return new Response(new Uint8Array(artwork.data), {
      headers: {
        'Content-Type': artwork.mimeType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err: any) {
    console.error('[API mp3/artwork] Error:', err);
    return c.text('Failed to load artwork', 500);
  }
});

// Stream audio file with HTTP Range support for instant preview/scrubbing
app.get('/stream', async (c) => {
  try {
    const filePath = c.req.query('path');
    if (!filePath) {
      return c.text('Missing path parameter', 400);
    }

    if (!fs.existsSync(filePath)) {
      return c.text('Audio file not found', 404);
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_MAP[ext] || 'audio/mpeg';

    const range = c.req.header('range');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        return new Response(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        });
      }

      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });
      const webStream = Readable.toWeb(fileStream);

      return new Response(webStream as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunksize),
          'Content-Type': contentType,
        },
      });
    } else {
      const fileStream = fs.createReadStream(filePath);
      const webStream = Readable.toWeb(fileStream);

      return new Response(webStream as any, {
        status: 200,
        headers: {
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
          'Content-Type': contentType,
        },
      });
    }
  } catch (err: any) {
    console.error('[API mp3/stream] Error:', err);
    return c.text('Failed to stream audio file', 500);
  }
});

// Create DJ Set (flatten move or copy)
app.post('/create-dj-set', async (c) => {
  try {
    const body = (await c.req.json()) as CreateDjSetRequest;
    if (!body.sessionName || !body.sessionName.trim()) {
      return c.json({ error: 'Session name is required' }, 400);
    }

    const result = await createDjSet(body);
    return c.json(result);
  } catch (err: any) {
    console.error('[API mp3/create-dj-set] Error:', err);
    return c.json({ error: err.message || 'Failed to create DJ set' }, 500);
  }
});

// Delete Tracks (physical disk removal)
app.post('/delete', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { filePaths, sourceDirectory } = body as { filePaths?: string[]; sourceDirectory?: string };

    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return c.json({ error: 'No files provided for deletion' }, 400);
    }

    const result = await deleteTracks(filePaths, sourceDirectory);
    return c.json(result);
  } catch (err: any) {
    console.error('[API mp3/delete] Error:', err);
    return c.json({ error: err.message || 'Failed to delete tracks' }, 500);
  }
});

export default app;

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { store } from '../db/index.js';
import { scanLocalDirectory, getTrackArtwork } from '../services/mp3/scanner.js';
import { createDjSet, deleteTracks, listDjSets } from '../services/mp3/djset.js';
import { analyzeAudioTrack } from '../services/mp3/analyzer.js';
import { CreateDjSetRequest, AnalyzeTracksRequest, AnalyzeTracksResponse } from '../../shared/types.js';

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

// Analyze Audio Tracks (BPM Autocorrelation & Krumhansl Key Detection - Standard JSON)
app.post('/analyze', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as AnalyzeTracksRequest;
    const filePaths = body.filePaths || [];
    const writeTags = Boolean(body.writeTags);

    if (filePaths.length === 0) {
      return c.json({ results: [], processedCount: 0, successCount: 0 }, 200);
    }

    const results = [];
    let successCount = 0;

    for (const filePath of filePaths) {
      const res = await analyzeAudioTrack(filePath, { writeTags });
      results.push(res);
      if (res.bpm && res.camelotKey) {
        successCount++;
      }
    }

    const response: AnalyzeTracksResponse = {
      results,
      processedCount: filePaths.length,
      successCount,
    };

    return c.json(response);
  } catch (err: any) {
    console.error('[API mp3/analyze] Error:', err);
    return c.json({ error: err.message || 'Failed to analyze tracks' }, 500);
  }
});

// Analyze Audio Tracks with Real-time SSE Progress Streaming
app.post('/analyze-stream', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as AnalyzeTracksRequest;
  const filePaths = body.filePaths || [];
  const writeTags = Boolean(body.writeTags);

  return streamSSE(c, async (stream) => {
    if (filePaths.length === 0) {
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'complete',
          results: [],
          processedCount: 0,
          successCount: 0,
        }),
        event: 'message',
      });
      return;
    }

    const results = [];
    let successCount = 0;

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      const fileName = path.basename(filePath);

      // Emit starting progress event
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'progress_start',
          current: i + 1,
          total: filePaths.length,
          percent: Math.round((i / filePaths.length) * 100),
          filePath,
          fileName,
        }),
        event: 'message',
      });

      const res = await analyzeAudioTrack(filePath, { writeTags });
      results.push(res);
      if (res.bpm && res.camelotKey) {
        successCount++;
      }

      // Emit track completed progress event with result
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'progress',
          current: i + 1,
          total: filePaths.length,
          percent: Math.round(((i + 1) / filePaths.length) * 100),
          filePath,
          fileName,
          result: res,
        }),
        event: 'message',
      });
    }

    // Emit final completion event
    await stream.writeSSE({
      data: JSON.stringify({
        type: 'complete',
        results,
        processedCount: filePaths.length,
        successCount,
      }),
      event: 'message',
    });
  });
});

export default app;

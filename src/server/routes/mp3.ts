import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { store } from '../db/index.js';
import { scanLocalDirectory, getTrackArtwork } from '../services/mp3/scanner.js';
import { createDjSet, deleteTracks, listDjSets } from '../services/mp3/djset.js';
import { analyzeAudioTrack } from '../services/mp3/analyzer.js';
import { analysisQueue, AnalysisJobEvent } from '../services/mp3/analysisQueue.js';
import { analysisPool } from '../services/mp3/analysisPool.js';
import { AnalyzeTracksResponse } from '../../shared/types.js';
import {
  analyzeTracksSchema,
  createDjSetSchema,
  deleteTracksSchema,
  filePathQuerySchema,
  scanDirectorySchema,
} from '../../shared/schemas.js';
import { errorResponse, parseBody, parseQuery } from '../util/validate.js';
import { assertAllowedPath, assertAllowedPaths, grantAndAssertDirectory } from '../util/paths.js';

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
    const body = await parseBody(c, scanDirectorySchema);
    const settings = store.getSettings();
    const targetDir = body.directory || settings.defaultLibraryDir || settings.defaultDownloadDir;

    if (!targetDir) {
      return c.json({ error: 'No directory specified and no default configured' }, 400);
    }

    // Scanning a directory is how the user opens a library, so an explicitly supplied directory
    // becomes an allowed root for the rest of the session. Everything reached through it is then
    // covered by the containment checks on stream/artwork/delete.
    const resolvedDir = grantAndAssertDirectory(targetDir);

    const result = await scanLocalDirectory(resolvedDir);
    return c.json(result);
  } catch (err) {
    return errorResponse(c, err, 'API mp3/scan');
  }
});

// Serve embedded artwork from audio file
app.get('/artwork', async (c) => {
  try {
    const { path: requestedPath } = parseQuery(c, filePathQuerySchema);
    const filePath = assertAllowedPath(requestedPath);

    const artwork = await getTrackArtwork(filePath);
    if (!artwork) {
      return c.text('No embedded artwork found', 404);
    }

    return new Response(new Uint8Array(artwork.data), {
      headers: {
        'Content-Type': artwork.mimeType,
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    return errorResponse(c, err, 'API mp3/artwork');
  }
});

// Stream audio file with HTTP Range support for instant preview/scrubbing
app.get('/stream', async (c) => {
  try {
    const { path: requestedPath } = parseQuery(c, filePathQuerySchema);

    // Without this check the route is an arbitrary file read reachable from any page in any
    // browser on the machine, via a plain <audio src> with no preflight.
    const filePath = assertAllowedPath(requestedPath);

    if (!fs.existsSync(filePath)) {
      return c.text('Audio file not found', 404);
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return c.text('Not a file', 400);
    }

    const fileSize = stat.size;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_MAP[ext];
    if (!contentType) {
      return c.text('Unsupported audio format', 415);
    }

    const range = c.req.header('range');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (Number.isNaN(start) || start < 0 || start >= fileSize || end >= fileSize || end < start) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}` },
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
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const fileStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(fileStream);

    return new Response(webStream as any, {
      status: 200,
      headers: {
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    return errorResponse(c, err, 'API mp3/stream');
  }
});

// Create DJ Set (flatten move or copy)
app.post('/create-dj-set', async (c) => {
  try {
    const body = await parseBody(c, createDjSetSchema);

    // Every source and the destination must sit inside an allowed root: this route moves files.
    const trackPaths = assertAllowedPaths(body.trackPaths ?? []);
    const targetDirectory = body.targetDirectory ? grantAndAssertDirectory(body.targetDirectory) : undefined;
    const sourceDirectory = body.sourceDirectory ? assertAllowedPath(body.sourceDirectory) : undefined;

    const result = await createDjSet({
      ...body,
      trackPaths,
      targetDirectory,
      sourceDirectory,
    });
    return c.json(result);
  } catch (err) {
    return errorResponse(c, err, 'API mp3/create-dj-set');
  }
});

// Delete Tracks (physical disk removal)
app.post('/delete', async (c) => {
  try {
    const body = await parseBody(c, deleteTracksSchema);

    // Unguarded, this route is an arbitrary unlink plus an upward-walking empty-directory sweep.
    const filePaths = assertAllowedPaths(body.filePaths);
    const sourceDirectory = body.sourceDirectory ? assertAllowedPath(body.sourceDirectory) : undefined;

    const result = await deleteTracks(filePaths, sourceDirectory);
    return c.json(result);
  } catch (err) {
    return errorResponse(c, err, 'API mp3/delete');
  }
});

// Analyze Audio Tracks (synchronous JSON; kept for small batches and scripting)
app.post('/analyze', async (c) => {
  try {
    const body = await parseBody(c, analyzeTracksSchema);
    const filePaths = assertAllowedPaths(body.filePaths);

    if (filePaths.length === 0) {
      return c.json({ results: [], processedCount: 0, successCount: 0 } as AnalyzeTracksResponse, 200);
    }

    const results = [];
    let successCount = 0;

    for (const filePath of filePaths) {
      const res = await analyzeAudioTrack(filePath, { writeTags: body.writeTags });
      results.push(res);
      // Count real detections only. This previously counted the hardcoded 128 BPM / 8B fallback.
      if (res.bpm !== null && res.camelotKey !== null) {
        successCount++;
      }
    }

    const response: AnalyzeTracksResponse = {
      results,
      processedCount: filePaths.length,
      successCount,
    };

    return c.json(response);
  } catch (err) {
    return errorResponse(c, err, 'API mp3/analyze');
  }
});

/**
 * Starts a background analysis job. Returns immediately with a job id; progress is observed on
 * /analyze-stream/:jobId and the job can be canceled. The work itself runs in the worker pool, so
 * a large batch no longer blocks the server.
 */
app.post('/analyze-jobs', async (c) => {
  try {
    const body = await parseBody(c, analyzeTracksSchema);
    const filePaths = assertAllowedPaths(body.filePaths);
    const job = analysisQueue.createJob(filePaths, body.writeTags);
    return c.json({ ...job, mode: analysisPool.mode, concurrency: analysisPool.concurrency });
  } catch (err) {
    return errorResponse(c, err, 'API mp3/analyze-jobs');
  }
});

app.get('/analyze-jobs/:jobId', (c) => {
  const job = analysisQueue.getJob(c.req.param('jobId'));
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json(job);
});

app.delete('/analyze-jobs/:jobId', (c) => {
  const canceled = analysisQueue.cancelJob(c.req.param('jobId'));
  if (!canceled) return c.json({ error: 'Job not found or already finished' }, 404);
  return c.json({ success: true });
});

// Observe a running job. Reconnecting after a page reload picks the job back up mid-flight.
app.get('/analyze-jobs/:jobId/events', (c) => {
  const jobId = c.req.param('jobId');
  const job = analysisQueue.getJob(jobId);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return streamSSE(c, async (stream) => {
    // Replay what already happened so a late subscriber is not missing the earlier results.
    await stream.writeSSE({
      data: JSON.stringify({
        type: 'snapshot',
        jobId,
        current: job.completed,
        total: job.total,
        percent: job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0,
        results: job.results,
        status: job.status,
      }),
      event: 'message',
    });

    let done = job.status === 'completed' || job.status === 'failed' || job.status === 'canceled';

    const handler = async (event: AnalysisJobEvent) => {
      try {
        await stream.writeSSE({ data: JSON.stringify(event), event: 'message' });
        if (event.type === 'complete' || event.type === 'canceled' || event.type === 'failed') {
          done = true;
        }
      } catch {
        done = true;
      }
    };

    analysisQueue.on(`job:${jobId}`, handler);
    stream.onAbort(() => {
      analysisQueue.off(`job:${jobId}`, handler);
    });

    while (!done && !stream.aborted) {
      await stream.sleep(15000);
      if (done || stream.aborted) break;
      try {
        await stream.writeSSE({ data: 'heartbeat', event: 'ping' });
      } catch {
        break;
      }
    }

    analysisQueue.off(`job:${jobId}`, handler);
  });
});

/**
 * Legacy one-shot streaming endpoint, kept so older clients keep working. Internally it now drives
 * a real job, so it inherits the worker pool and no longer occupies the event loop.
 */
app.post('/analyze-stream', async (c) => {
  let filePaths: string[];
  let writeTags: boolean;

  try {
    const body = await parseBody(c, analyzeTracksSchema);
    filePaths = assertAllowedPaths(body.filePaths);
    writeTags = body.writeTags;
  } catch (err) {
    return errorResponse(c, err, 'API mp3/analyze-stream');
  }

  return streamSSE(c, async (stream) => {
    if (filePaths.length === 0) {
      await stream.writeSSE({
        data: JSON.stringify({ type: 'complete', results: [], processedCount: 0, successCount: 0 }),
        event: 'message',
      });
      return;
    }

    const job = analysisQueue.createJob(filePaths, writeTags);
    let done = false;

    const handler = async (event: AnalysisJobEvent) => {
      try {
        await stream.writeSSE({ data: JSON.stringify(event), event: 'message' });
        if (event.type === 'complete' || event.type === 'canceled' || event.type === 'failed') {
          done = true;
        }
      } catch {
        done = true;
      }
    };

    analysisQueue.on(`job:${job.id}`, handler);
    stream.onAbort(() => {
      analysisQueue.cancelJob(job.id);
      analysisQueue.off(`job:${job.id}`, handler);
    });

    while (!done && !stream.aborted) {
      await stream.sleep(250);
    }

    analysisQueue.off(`job:${job.id}`, handler);
  });
});

export default app;

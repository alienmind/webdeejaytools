import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import { AudioAnalysisResult } from '../../../shared/types.js';
import { analyzeAudioTrack } from './analyzer.js';

/**
 * Worker pool for audio analysis.
 *
 * Analysis is the only genuinely CPU-bound work in the app: decode, IIR filter, autocorrelation
 * over ~200 lags, and 60 FFTs per track. Running it on the HTTP thread froze the whole server for
 * the duration of a batch - no artwork, no preview streaming, not even an SSE heartbeat - and used
 * exactly one core no matter what the machine had.
 *
 * The worker script only exists as a separate file in the packaged build (Vite emits it as a second
 * entry point). When it is absent - the Vite dev server, or unit tests - the pool degrades to
 * in-process execution that yields to the event loop between tracks. Same API either way, so
 * nothing above this file has to care which mode is active.
 */

const MAX_WORKERS = Math.max(1, Math.min(4, (os.cpus()?.length || 2) - 1));

interface PendingTask {
  id: string;
  filePath: string;
  writeTags: boolean;
  resolve: (result: AudioAnalysisResult) => void;
}

function resolveWorkerScript(): string | null {
  const explicit = process.env.WDT_ANALYSIS_WORKER;
  if (explicit && fs.existsSync(explicit)) return explicit;

  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.join(here, 'analysis-worker.js'),
      path.join(here, '..', 'analysis-worker.js'),
      path.join(here, 'analysisWorker.js'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // import.meta.url is unavailable in some test transforms; fall through to inline mode.
  }

  return null;
}

class AnalysisPool {
  private workerScript: string | null;
  private idle: Worker[] = [];
  private busy = new Set<Worker>();
  private queue: PendingTask[] = [];
  private pending = new Map<string, PendingTask>();
  private spawned = 0;
  private warnedInline = false;

  constructor() {
    this.workerScript = resolveWorkerScript();
  }

  public get mode(): 'workers' | 'inline' {
    return this.workerScript ? 'workers' : 'inline';
  }

  public get concurrency(): number {
    return this.workerScript ? MAX_WORKERS : 1;
  }

  public analyze(filePath: string, writeTags: boolean): Promise<AudioAnalysisResult> {
    if (!this.workerScript) {
      return this.analyzeInline(filePath, writeTags);
    }

    return new Promise<AudioAnalysisResult>((resolve) => {
      const task: PendingTask = {
        id: crypto.randomBytes(8).toString('hex'),
        filePath,
        writeTags,
        resolve,
      };
      this.queue.push(task);
      this.drain();
    });
  }

  /**
   * Fallback path. Still awaits a macrotask before each track so a long batch cannot starve SSE
   * heartbeats or an in-flight audio range request the way the original synchronous loop did.
   */
  private async analyzeInline(filePath: string, writeTags: boolean): Promise<AudioAnalysisResult> {
    if (!this.warnedInline) {
      this.warnedInline = true;
      console.warn('[AnalysisPool] Worker script not found; analysing in-process (development mode).');
    }
    await new Promise((resolve) => setImmediate(resolve));
    return analyzeAudioTrack(filePath, { writeTags });
  }

  private drain(): void {
    while (this.queue.length > 0) {
      const worker = this.acquireWorker();
      if (!worker) return;

      const task = this.queue.shift()!;
      this.pending.set(task.id, task);
      this.busy.add(worker);
      (worker as any).__taskId = task.id;
      worker.postMessage({ id: task.id, filePath: task.filePath, writeTags: task.writeTags });
    }
  }

  private acquireWorker(): Worker | null {
    const idle = this.idle.pop();
    if (idle) return idle;
    if (this.spawned >= MAX_WORKERS) return null;
    return this.spawnWorker();
  }

  private spawnWorker(): Worker | null {
    if (!this.workerScript) return null;

    try {
      const worker = new Worker(this.workerScript);
      this.spawned++;

      worker.on('message', (message: { id: string; result: AudioAnalysisResult }) => {
        const task = this.pending.get(message.id);
        if (task) {
          this.pending.delete(message.id);
          task.resolve(message.result);
        }
        this.release(worker);
      });

      worker.on('error', (err) => {
        console.error('[AnalysisPool] Worker error:', err);
        this.failWorker(worker, err.message || 'Analysis worker crashed');
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          this.failWorker(worker, `Analysis worker exited with code ${code}`);
        }
      });

      worker.unref();
      return worker;
    } catch (err) {
      console.error('[AnalysisPool] Failed to spawn worker, falling back to in-process:', err);
      this.workerScript = null;
      return null;
    }
  }

  /** A crashed worker still owes an answer for whatever it was holding. */
  private failWorker(worker: Worker, message: string): void {
    const taskId = (worker as any).__taskId as string | undefined;
    if (taskId) {
      const task = this.pending.get(taskId);
      if (task) {
        this.pending.delete(taskId);
        task.resolve({
          filePath: task.filePath,
          bpm: null,
          key: null,
          camelotKey: null,
          confidence: 0,
          tagsWritten: false,
          error: message,
        });
      }
    }

    this.busy.delete(worker);
    this.idle = this.idle.filter((w) => w !== worker);
    this.spawned = Math.max(0, this.spawned - 1);
    worker.terminate().catch(() => undefined);
    this.drain();
  }

  private release(worker: Worker): void {
    (worker as any).__taskId = undefined;
    this.busy.delete(worker);
    this.idle.push(worker);
    this.drain();
  }

  public async shutdown(): Promise<void> {
    const all = [...this.idle, ...this.busy];
    this.idle = [];
    this.busy.clear();
    this.spawned = 0;
    await Promise.all(all.map((w) => w.terminate().catch(() => undefined)));
  }
}

export const analysisPool = new AnalysisPool();

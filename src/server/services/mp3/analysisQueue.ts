import EventEmitter from 'events';
import path from 'path';
import crypto from 'crypto';
import { AnalysisJob, AudioAnalysisResult } from '../../../shared/types.js';
import { analysisPool } from './analysisPool.js';

/**
 * Job-based batch analysis.
 *
 * The previous design ran the batch inside the SSE request handler, so closing the tab or
 * reloading the page killed the work mid-way with tags half written, and there was no way to
 * cancel a batch short of killing the app. Here the job owns the work, the SSE stream is just an
 * observer, and cancellation is a first-class operation.
 */

export interface AnalysisJobEvent {
  type: 'progress_start' | 'progress' | 'complete' | 'canceled' | 'failed';
  jobId: string;
  current: number;
  total: number;
  percent: number;
  filePath?: string;
  fileName?: string;
  result?: AudioAnalysisResult;
  results?: AudioAnalysisResult[];
  processedCount?: number;
  successCount?: number;
  error?: string;
}

interface InternalJob extends AnalysisJob {
  filePaths: string[];
  canceled: boolean;
}

/** Finished jobs are kept briefly so a reconnecting client can still collect the result. */
const JOB_RETENTION_MS = 10 * 60 * 1000;

export class AnalysisQueue extends EventEmitter {
  private jobs = new Map<string, InternalJob>();

  public createJob(filePaths: string[], writeTags: boolean): AnalysisJob {
    const job: InternalJob = {
      id: `an_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      status: 'queued',
      total: filePaths.length,
      completed: 0,
      successCount: 0,
      writeTags,
      results: [],
      startedAt: new Date().toISOString(),
      filePaths,
      canceled: false,
    };

    this.jobs.set(job.id, job);
    void this.run(job);
    return this.toPublic(job);
  }

  public getJob(jobId: string): AnalysisJob | undefined {
    const job = this.jobs.get(jobId);
    return job ? this.toPublic(job) : undefined;
  }

  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed' || job.status === 'failed') return false;
    job.canceled = true;
    return true;
  }

  private toPublic(job: InternalJob): AnalysisJob {
    const { filePaths: _filePaths, canceled: _canceled, ...rest } = job;
    return { ...rest, results: [...job.results] };
  }

  private emitEvent(event: AnalysisJobEvent): void {
    this.emit(`job:${event.jobId}`, event);
  }

  private async run(job: InternalJob): Promise<void> {
    job.status = 'running';

    if (job.total === 0) {
      this.finish(job, 'completed');
      return;
    }

    // Dispatch up to the pool's concurrency at once. Results are recorded in completion order,
    // which is why each event carries its own filePath rather than relying on an index.
    const concurrency = Math.max(1, Math.min(analysisPool.concurrency, job.total));
    let nextIndex = 0;

    const runOne = async (): Promise<void> => {
      for (;;) {
        if (job.canceled) return;
        const index = nextIndex++;
        if (index >= job.filePaths.length) return;

        const filePath = job.filePaths[index];
        const fileName = path.basename(filePath);

        this.emitEvent({
          type: 'progress_start',
          jobId: job.id,
          current: job.completed + 1,
          total: job.total,
          percent: Math.round((job.completed / job.total) * 100),
          filePath,
          fileName,
        });

        const result = await analysisPool.analyze(filePath, job.writeTags);

        if (job.canceled) return;

        job.results.push(result);
        job.completed++;
        job.currentFile = fileName;
        if (result.bpm !== null && result.camelotKey !== null) {
          job.successCount++;
        }

        this.emitEvent({
          type: 'progress',
          jobId: job.id,
          current: job.completed,
          total: job.total,
          percent: Math.round((job.completed / job.total) * 100),
          filePath,
          fileName,
          result,
        });
      }
    };

    try {
      await Promise.all(Array.from({ length: concurrency }, () => runOne()));
      this.finish(job, job.canceled ? 'canceled' : 'completed');
    } catch (err: any) {
      job.error = err?.message || 'Analysis job failed';
      this.finish(job, 'failed');
    }
  }

  private finish(job: InternalJob, status: AnalysisJob['status']): void {
    job.status = status;
    job.finishedAt = new Date().toISOString();

    this.emitEvent({
      type: status === 'completed' ? 'complete' : status === 'canceled' ? 'canceled' : 'failed',
      jobId: job.id,
      current: job.completed,
      total: job.total,
      percent: job.total > 0 ? Math.round((job.completed / job.total) * 100) : 100,
      results: job.results,
      processedCount: job.completed,
      successCount: job.successCount,
      error: job.error,
    });

    const timer = setTimeout(() => this.jobs.delete(job.id), JOB_RETENTION_MS);
    // Do not hold the process open just to expire a finished job.
    if (typeof timer.unref === 'function') timer.unref();
  }
}

export const analysisQueue = new AnalysisQueue();

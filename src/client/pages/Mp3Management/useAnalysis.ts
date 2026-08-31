import { useCallback, useRef, useState } from 'react';
import { AudioAnalysisResult, LocalTrackItem } from '../../../shared/types.js';
import { api } from '../../services/api.js';
import { useToast } from '../../components/Toast.js';

export type AnalyzeScope = 'missing' | 'all' | 'selected';

export interface AnalysisProgressState {
  current: number;
  total: number;
  percent: number;
  currentFileName?: string;
}

/**
 * BPM and key analysis, driven by the server-side job API.
 *
 * The batch runs in the server's worker pool, so the UI stays responsive and the work survives a
 * page reload. It is also cancellable, which the previous request-scoped implementation was not.
 */
export function useAnalysis(options: {
  onTrackAnalyzed: (filePath: string, patch: Partial<LocalTrackItem>) => void;
  onFinished: () => void | Promise<void>;
}) {
  const toast = useToast();
  const jobIdRef = useRef<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [writeTags, setWriteTags] = useState(true);
  const [scope, setScope] = useState<AnalyzeScope>('missing');
  const [results, setResults] = useState<AudioAnalysisResult[] | null>(null);
  const [liveResults, setLiveResults] = useState<AudioAnalysisResult[]>([]);
  const [progress, setProgress] = useState<AnalysisProgressState | null>(null);

  const reset = useCallback(() => {
    setResults(null);
    setLiveResults([]);
    setProgress(null);
  }, []);

  const selectTargets = useCallback(
    (allTracks: LocalTrackItem[], selectedIds: Set<string>): LocalTrackItem[] => {
      if (scope === 'selected') return allTracks.filter((t) => selectedIds.has(t.id));
      if (scope === 'missing') return allTracks.filter((t) => !t.bpm || !t.key);
      return allTracks;
    },
    [scope]
  );

  const start = useCallback(
    async (targets: LocalTrackItem[]) => {
      if (targets.length === 0) {
        toast.info('No tracks match the selected analysis criteria.');
        return;
      }

      try {
        setIsAnalyzing(true);
        setResults(null);
        setLiveResults([]);
        setProgress({ current: 0, total: targets.length, percent: 0, currentFileName: targets[0]?.fileName });

        const job = await api.startAnalysisJob(
          targets.map((t) => t.filePath),
          writeTags
        );
        jobIdRef.current = job.id;

        await new Promise<void>((resolve, reject) => {
          const unsubscribe = api.observeAnalysisJob(job.id, (event) => {
            if (event.type === 'progress_start') {
              setProgress({
                current: event.current,
                total: event.total,
                percent: event.percent,
                currentFileName: event.fileName,
              });
              return;
            }

            if (event.type === 'progress' && event.result) {
              setProgress({
                current: event.current,
                total: event.total,
                percent: event.percent,
                currentFileName: event.fileName,
              });
              setLiveResults((prev) => [event.result!, ...prev]);

              const analyzed = event.result;
              if (analyzed.bpm !== null || analyzed.camelotKey !== null) {
                options.onTrackAnalyzed(analyzed.filePath, {
                  bpm: analyzed.bpm ?? undefined,
                  key: analyzed.camelotKey ?? analyzed.key ?? undefined,
                });
              }
              return;
            }

            if (event.type === 'complete' || event.type === 'canceled') {
              unsubscribe();
              setResults(event.results || []);
              setProgress(null);
              resolve();
              return;
            }

            if (event.type === 'failed') {
              unsubscribe();
              reject(new Error(event.error || 'Analysis failed'));
            }
          });
        });

        // Re-read from disk so the table reflects what was actually written.
        await options.onFinished();
      } catch (err: any) {
        toast.error('Analysis failed', err?.message);
      } finally {
        jobIdRef.current = null;
        setIsAnalyzing(false);
      }
    },
    [writeTags, toast, options]
  );

  const cancel = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    try {
      await api.cancelAnalysisJob(jobId);
      toast.info('Analysis canceled');
    } catch (err: any) {
      toast.error('Could not cancel the analysis', err?.message);
    }
  }, [toast]);

  return {
    isAnalyzing,
    writeTags,
    setWriteTags,
    scope,
    setScope,
    results,
    liveResults,
    progress,
    reset,
    selectTargets,
    start,
    cancel,
  };
}

import { parentPort } from 'worker_threads';
import { analyzeAudioTrack } from './analyzer.js';

/**
 * Worker entry point for audio analysis.
 *
 * One message in (`{ id, filePath, writeTags }`), one result out. Keeping the worker this dumb
 * means the pool owns all scheduling and the analyzer stays a plain pure-ish function that is
 * still directly callable from tests.
 */

interface AnalyzeMessage {
  id: string;
  filePath: string;
  writeTags: boolean;
}

if (!parentPort) {
  throw new Error('analysisWorker must be started as a worker thread');
}

parentPort.on('message', async (message: AnalyzeMessage) => {
  try {
    const result = await analyzeAudioTrack(message.filePath, { writeTags: message.writeTags });
    parentPort!.postMessage({ id: message.id, result });
  } catch (err: any) {
    parentPort!.postMessage({
      id: message.id,
      result: {
        filePath: message.filePath,
        bpm: null,
        key: null,
        camelotKey: null,
        confidence: 0,
        tagsWritten: false,
        error: err?.message || 'Analysis worker failed',
      },
    });
  }
});

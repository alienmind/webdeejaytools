import fs from 'fs';
import path from 'path';
import decodeAudio from 'audio-decode';
import * as musicMetadata from 'music-metadata';
import { parseKeyToCamelot, formatCamelotKey } from '../../../shared/harmonic.js';
import { AudioAnalysisResult } from '../../../shared/types.js';
import { writeAnalysisTags } from '../tagging/index.js';

/**
 * Below this, a detection is treated as a guess and is never written to the user's files. A wrong
 * key silently ruins harmonic mixing and is indistinguishable from a real one once on disk, so the
 * bar for touching a library file is deliberately higher than the bar for showing a number.
 */
export const MIN_TAG_WRITE_CONFIDENCE = 0.35;

// Pitch class names (0 = C, 1 = C#, ... 11 = B)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Krumhansl-Kessler key profiles (standard tonal hierarchies)
const KRUMHANSL_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KRUMHANSL_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/**
 * Computes Pearson correlation coefficient between two 12-element vectors
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    numerator += diffX * diffY;
    denomX += diffX * diffX;
    denomY += diffY * diffY;
  }

  const denominator = Math.sqrt(denomX * denomY);
  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * 2nd-order IIR Low-Pass Butterworth Filter for isolating kick drum & bass fundamentals
 */
export function applyLowPassFilter(samples: Float32Array, sampleRate: number, cutoffHz: number = 130): Float32Array {
  const output = new Float32Array(samples.length);
  const ita = 1.0 / Math.tan((Math.PI * cutoffHz) / sampleRate);
  const q = Math.SQRT2;

  const b0 = 1.0 / (1.0 + q * ita + ita * ita);
  const b1 = 2.0 * b0;
  const b2 = b0;
  const a1 = 2.0 * (ita * ita - 1.0) * b0;
  const a2 = -(1.0 - q * ita + ita * ita) * b0;

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 + a1 * y1 + a2 * y2;
    output[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return output;
}

/**
 * Detects BPM using Envelope Energy and Autocorrelation across the 65–195 BPM tempo range.
 *
 * Returns `bpm: null` when the input is too short or too flat to support a tempo estimate. It
 * previously returned a hardcoded 128 with confidence 0, which callers then wrote to disk as if it
 * had been measured.
 */
export function detectBpmFromPcm(samples: Float32Array, sampleRate: number): { bpm: number | null; confidence: number } {
  if (!samples || samples.length < sampleRate * 2) {
    return { bpm: null, confidence: 0 };
  }

  // 1. Filter low frequencies (kick/bass)
  const filtered = applyLowPassFilter(samples, sampleRate, 135);

  // 2. Compute energy envelope with sliding window
  const windowSize = 512;
  const hopSize = 128;
  const numFrames = Math.floor((filtered.length - windowSize) / hopSize);
  if (numFrames <= 0) return { bpm: null, confidence: 0 };

  const envelope = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopSize;
    let sumSquares = 0;
    for (let w = 0; w < windowSize; w++) {
      const s = filtered[offset + w];
      sumSquares += s * s;
    }
    envelope[f] = Math.sqrt(sumSquares / windowSize);
  }

  // 3. First-order difference for onset slope
  const onsets = new Float32Array(numFrames);
  for (let i = 1; i < numFrames; i++) {
    const diff = envelope[i] - envelope[i - 1];
    onsets[i] = diff > 0 ? diff : 0;
  }

  // 4. Autocorrelation over BPM range (65 to 195 BPM)
  const envelopeRate = sampleRate / hopSize;
  const minBpm = 65;
  const maxBpm = 195;
  const minLag = Math.floor((60 * envelopeRate) / maxBpm);
  const maxLag = Math.ceil((60 * envelopeRate) / minBpm);

  let bestLag = minLag;
  let maxCorr = -Infinity;
  const correlations: { bpm: number; score: number }[] = [];

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < numFrames - lag; i++) {
      sum += onsets[i] * onsets[i + lag];
      count++;
    }
    const score = count > 0 ? sum / count : 0;
    const bpm = (60 * envelopeRate) / lag;
    correlations.push({ bpm, score });

    if (score > maxCorr) {
      maxCorr = score;
      bestLag = lag;
    }
  }

  if (!isFinite(maxCorr) || maxCorr <= 0) {
    return { bpm: null, confidence: 0 };
  }

  let rawBpm = (60 * envelopeRate) / bestLag;

  // 5. Octave / Subharmonic check (e.g. if 64 BPM detected in dance music, boost to 128 BPM)
  if (rawBpm < 90) {
    const doubleBpm = rawBpm * 2;
    if (doubleBpm <= 180) {
      rawBpm = doubleBpm;
    }
  } else if (rawBpm > 180) {
    rawBpm = rawBpm / 2;
  }

  const roundedBpm = Math.round(rawBpm * 10) / 10;

  // 6. Confidence as peak prominence.
  //
  // The raw autocorrelation magnitude scales with track loudness, so `maxCorr * 10` reported high
  // confidence for anything loud regardless of how peaked the correlation actually was. Dividing
  // the winning lag by the mean of all other lags is scale-invariant and measures the thing that
  // actually predicts correctness: how far the winner stands above the field.
  let sumOthers = 0;
  let countOthers = 0;
  for (const entry of correlations) {
    if (entry.score === maxCorr) continue;
    sumOthers += entry.score;
    countOthers++;
  }
  const meanOthers = countOthers > 0 ? sumOthers / countOthers : 0;
  const prominence = meanOthers > 0 ? maxCorr / meanOthers : 0;

  // A flat autocorrelation gives a ratio near 1; a clean four-to-the-floor kick gives 2 or more.
  const confidence = Math.min(1, Math.max(0, (prominence - 1) / 1.5));

  return { bpm: Math.round(roundedBpm), confidence };
}

// Pre-computed Radix-2 Cooley-Tukey FFT Engine (430x faster than standard DFT)
class Radix2FFT {
  private size: number;
  private cosTable: Float32Array;
  private sinTable: Float32Array;
  private bitRev: Uint32Array;

  constructor(size: number) {
    this.size = size;
    const half = size / 2;
    this.cosTable = new Float32Array(half);
    this.sinTable = new Float32Array(half);
    for (let i = 0; i < half; i++) {
      this.cosTable[i] = Math.cos((-2 * Math.PI * i) / size);
      this.sinTable[i] = Math.sin((-2 * Math.PI * i) / size);
    }
    this.bitRev = new Uint32Array(size);
    let j = 0;
    for (let i = 0; i < size - 1; i++) {
      this.bitRev[i] = j;
      let k = size >> 1;
      while (k <= j) {
        j -= k;
        k >>= 1;
      }
      j += k;
    }
    this.bitRev[size - 1] = size - 1;
  }

  public computeMagnitudes(samples: Float32Array, magOut: Float32Array): void {
    const n = this.size;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    const pi2 = 2 * Math.PI;

    // Bit reversal with Hann windowing
    for (let i = 0; i < n; i++) {
      const window = 0.5 * (1 - Math.cos((pi2 * i) / (n - 1)));
      real[this.bitRev[i]] = (samples[i] || 0) * window;
      imag[this.bitRev[i]] = 0;
    }

    // Cooley-Tukey decimation-in-time
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const tIdx = k * step;
          const uR = real[i + k];
          const uI = imag[i + k];
          const vR = real[i + k + half] * this.cosTable[tIdx] - imag[i + k + half] * this.sinTable[tIdx];
          const vI = real[i + k + half] * this.sinTable[tIdx] + imag[i + k + half] * this.cosTable[tIdx];
          real[i + k] = uR + vR;
          imag[i + k] = uI + vI;
          real[i + k + half] = uR - vR;
          imag[i + k + half] = uI - vI;
        }
      }
    }

    const halfN = n >> 1;
    for (let i = 0; i < halfN; i++) {
      magOut[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }
  }
}

const FFT_2048 = new Radix2FFT(2048);

/**
 * Detects Musical Key and Camelot code using 12-bin STFT Chromagram & Krumhansl-Schmuckler correlation.
 */
export function detectKeyFromPcm(samples: Float32Array, sampleRate: number): {
  key: string | null;
  camelotKey: string | null;
  confidence: number;
} {
  if (!samples || samples.length < sampleRate) {
    return { key: null, camelotKey: null, confidence: 0 };
  }

  const chromagram = new Float32Array(12);
  const fftSize = 2048;
  const hopSize = 1024;
  const numFrames = Math.min(60, Math.floor((samples.length - fftSize) / hopSize));

  if (numFrames <= 0) {
    return { key: null, camelotKey: null, confidence: 0 };
  }

  const magBuffer = new Float32Array(fftSize / 2);

  // Analyze frames
  for (let f = 0; f < numFrames; f++) {
    const frameSlice = samples.subarray(f * hopSize, f * hopSize + fftSize);
    FFT_2048.computeMagnitudes(frameSlice, magBuffer);

    // Fold FFT frequency bins into 12 Pitch Classes (65 Hz to 2500 Hz)
    const minFreq = 65;
    const maxFreq = 2500;
    const binWidth = sampleRate / fftSize;

    for (let k = 1; k < magBuffer.length; k++) {
      const freq = k * binWidth;
      if (freq < minFreq || freq > maxFreq) continue;

      // MIDI note number = 69 + 12 * log2(freq / 440)
      const midi = 69 + 12 * Math.log2(freq / 440);
      const pitchClass = Math.round(midi) % 12;
      const validPitch = (pitchClass + 12) % 12;

      chromagram[validPitch] += magBuffer[k];
    }
  }

  // Normalize chromagram vector. A silent or DC-only frame set carries no tonal information at
  // all, so report that rather than correlating a flat vector and returning whichever profile wins
  // by rounding noise.
  let sumChroma = 0;
  for (let i = 0; i < 12; i++) sumChroma += chromagram[i];
  if (sumChroma <= 0) {
    return { key: null, camelotKey: null, confidence: 0 };
  }
  const normalizedChroma = Array.from(chromagram).map((v) => v / sumChroma);

  // Correlate with 12 Major and 12 Minor Krumhansl profiles
  let bestScore = -Infinity;
  let bestKeyName = 'C';
  let bestCamelot = '8B';

  // Test Major keys (0..11)
  for (let root = 0; root < 12; root++) {
    const profile = new Array(12);
    for (let i = 0; i < 12; i++) {
      profile[i] = KRUMHANSL_MAJOR[(i - root + 12) % 12];
    }
    const score = pearsonCorrelation(normalizedChroma, profile);
    if (score > bestScore) {
      bestScore = score;
      bestKeyName = NOTE_NAMES[root]; // Major
      const parsed = parseKeyToCamelot(bestKeyName);
      bestCamelot = parsed ? formatCamelotKey(parsed) : '8B';
    }
  }

  // Test Minor keys (0..11)
  for (let root = 0; root < 12; root++) {
    const profile = new Array(12);
    for (let i = 0; i < 12; i++) {
      profile[i] = KRUMHANSL_MINOR[(i - root + 12) % 12];
    }
    const score = pearsonCorrelation(normalizedChroma, profile);
    if (score > bestScore) {
      bestScore = score;
      bestKeyName = `${NOTE_NAMES[root]}m`; // Minor
      const parsed = parseKeyToCamelot(bestKeyName);
      bestCamelot = parsed ? formatCamelotKey(parsed) : '8A';
    }
  }

  if (!isFinite(bestScore) || bestScore <= 0) {
    return { key: null, camelotKey: null, confidence: 0 };
  }

  return {
    key: bestKeyName,
    camelotKey: bestCamelot,
    confidence: Math.min(1, Math.max(0, bestScore)),
  };
}

/**
 * Chooses how many bytes to read from the head of the file.
 *
 * A flat 8 MB cap covers ~200 seconds of 320kbps MP3 but only ~6 seconds of FLAC 24/192 - the
 * format this app advertises - which starved the autocorrelation of the tens of seconds it needs.
 * Sizing from the actual bitrate gives every format the same amount of *audio*.
 */
async function planReadWindow(filePath: string): Promise<{ readBytes: number; analysisSeconds: number }> {
  const ANALYSIS_SECONDS = 60;
  const MAX_READ_BYTES = 96 * 1024 * 1024;
  const FALLBACK_READ_BYTES = 16 * 1024 * 1024;

  try {
    const meta = await musicMetadata.parseFile(filePath, { duration: false });
    const bitrate = meta.format.bitrate;
    if (typeof bitrate === 'number' && bitrate > 0) {
      // bitrate is bits/sec; add a margin for the header and for frame alignment slack.
      const bytes = Math.ceil((bitrate / 8) * ANALYSIS_SECONDS * 1.15) + 256 * 1024;
      return { readBytes: Math.min(bytes, MAX_READ_BYTES), analysisSeconds: ANALYSIS_SECONDS };
    }
  } catch {
    // Unparseable header - fall through to the fixed window.
  }

  return { readBytes: FALLBACK_READ_BYTES, analysisSeconds: ANALYSIS_SECONDS };
}

/**
 * Analyzes a local audio file and extracts BPM and Camelot Key.
 */
export async function analyzeAudioTrack(
  filePath: string,
  options?: { writeTags?: boolean }
): Promise<AudioAnalysisResult> {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    return {
      filePath,
      bpm: null,
      key: null,
      camelotKey: null,
      confidence: 0,
      tagsWritten: false,
      error: 'File does not exist',
    };
  }

  try {
    // Read a bitrate-sized window rather than a fixed byte count, so hi-res FLAC gets the same
    // number of seconds of audio to analyse as a 320kbps MP3 does.
    const fileStat = await fs.promises.stat(resolvedPath);
    const plan = await planReadWindow(resolvedPath);
    const readSize = Math.min(fileStat.size, plan.readBytes);
    const fd = await fs.promises.open(resolvedPath, 'r');
    const buffer = Buffer.alloc(readSize);
    await fd.read(buffer, 0, readSize, 0);
    await fd.close();

    // Decode audio via zero-native audio-decode
    const decoded = await decodeAudio(buffer);
    if (!decoded || !decoded.channelData || decoded.channelData.length === 0) {
      throw new Error('Failed to decode audio PCM data');
    }

    const sampleRate = decoded.sampleRate || 44100;
    const channels = decoded.channelData;

    // Mixdown to mono Float32Array.
    // Skip the intro (quiet, often beatless) but never skip so far that little is left to analyse.
    const totalSamples = channels[0].length;
    const startSample = Math.min(Math.floor(sampleRate * 15), Math.floor(totalSamples * 0.2));
    const maxSamples = Math.max(0, Math.min(totalSamples - startSample, sampleRate * 45));

    if (maxSamples < sampleRate * 2) {
      throw new Error('Decoded audio is too short to analyse');
    }

    const mono = new Float32Array(maxSamples);
    if (channels.length >= 2) {
      const left = channels[0];
      const right = channels[1];
      for (let i = 0; i < maxSamples; i++) {
        mono[i] = (left[startSample + i] + right[startSample + i]) * 0.5;
      }
    } else {
      const ch = channels[0];
      for (let i = 0; i < maxSamples; i++) {
        mono[i] = ch[startSample + i];
      }
    }

    // 1. BPM Detection
    const bpmResult = detectBpmFromPcm(mono, sampleRate);

    // 2. Key Detection
    const keyResult = detectKeyFromPcm(mono, sampleRate);

    const confidence = Math.round(((bpmResult.confidence + keyResult.confidence) / 2) * 100) / 100;
    const detected = bpmResult.bpm !== null && keyResult.camelotKey !== null;

    let tagsWritten = false;
    let tagError: string | undefined;

    if (options?.writeTags) {
      if (!detected) {
        tagError = 'Analysis produced no usable BPM or key; nothing was written.';
      } else if (confidence < MIN_TAG_WRITE_CONFIDENCE) {
        tagError = `Confidence ${confidence.toFixed(2)} is below the ${MIN_TAG_WRITE_CONFIDENCE} threshold; nothing was written.`;
      } else {
        const outcome = await writeAnalysisTags(resolvedPath, bpmResult.bpm!, keyResult.camelotKey!);
        tagsWritten = outcome.success;
        if (!outcome.success) {
          tagError = outcome.error;
        }
      }
    }

    return {
      filePath,
      bpm: bpmResult.bpm,
      key: keyResult.key,
      camelotKey: keyResult.camelotKey,
      confidence,
      tagsWritten,
      lowConfidence: detected && confidence < MIN_TAG_WRITE_CONFIDENCE,
      error: tagError,
    };
  } catch (err: any) {
    console.error(`[AudioAnalyzer] Failed to analyze ${filePath}:`, err);
    return {
      filePath,
      bpm: null,
      key: null,
      camelotKey: null,
      confidence: 0,
      tagsWritten: false,
      error: err.message || 'Analysis failed',
    };
  }
}

/**
 * Saves detected BPM and Key into audio file tags on disk.
 *
 * Delegates to the two-phase writer: the original file is copied, tagged, re-parsed, and only
 * replaced once the values have been read back out of the candidate.
 */
export async function saveTrackTags(filePath: string, bpm: number, keyOrCamelot: string): Promise<boolean> {
  const outcome = await writeAnalysisTags(filePath, bpm, keyOrCamelot);
  if (!outcome.success) {
    console.error(`[AudioAnalyzer] Failed to write tags to ${filePath}: ${outcome.error}`);
  }
  return outcome.success;
}

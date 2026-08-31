import { describe, it, expect } from 'vitest';
import {
  pearsonCorrelation,
  applyLowPassFilter,
  detectBpmFromPcm,
  detectKeyFromPcm,
} from '../../src/server/services/mp3/analyzer.js';

/**
 * The important guarantee below is the negative one: a failed detection must report null, never a
 * plausible-looking default. The previous implementation returned a hardcoded 128 BPM / 8B key with
 * confidence 0, which callers then wrote into the user's files as if it had been measured.
 */

describe('Audio DSP Analyzer', () => {
  it('computes exact Pearson correlation coefficient', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [2, 4, 6, 8, 10]; // perfectly correlated
    expect(pearsonCorrelation(a, b)).toBeCloseTo(1.0, 4);

    const c = [5, 4, 3, 2, 1]; // perfectly inverted
    expect(pearsonCorrelation(a, c)).toBeCloseTo(-1.0, 4);

    const zeros = [0, 0, 0, 0, 0];
    expect(pearsonCorrelation(a, zeros)).toBe(0);
  });

  it('applies low pass filter without blowing up signal', () => {
    const sampleRate = 44100;
    const samples = new Float32Array(sampleRate * 2);
    // Fill with high frequency noise + DC offset
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 5000 * i) / sampleRate);
    }

    const filtered = applyLowPassFilter(samples, sampleRate, 130);
    expect(filtered.length).toBe(samples.length);
    // High frequencies (5000 Hz) should be heavily attenuated by 130Hz filter
    let maxFiltered = 0;
    for (let i = 1000; i < filtered.length; i++) {
      if (Math.abs(filtered[i]) > maxFiltered) maxFiltered = Math.abs(filtered[i]);
    }
    expect(maxFiltered).toBeLessThan(0.1);
  });

  it('detects BPM from rhythmic pulse signal', () => {
    const sampleRate = 22050;
    const durationSec = 10;
    const samples = new Float32Array(sampleRate * durationSec);
    const targetBpm = 120;
    const intervalSamples = Math.round((60 / targetBpm) * sampleRate);

    // Create synthetic kick drums every 0.5s (120 BPM)
    for (let pos = 0; pos < samples.length; pos += intervalSamples) {
      // 50ms 80Hz sine kick pulse
      for (let i = 0; i < Math.min(Math.round(sampleRate * 0.05), samples.length - pos); i++) {
        const env = 1 - i / (sampleRate * 0.05);
        samples[pos + i] += Math.sin((2 * Math.PI * 80 * i) / sampleRate) * env;
      }
    }

    const res = detectBpmFromPcm(samples, sampleRate);
    expect(res.bpm).toBeGreaterThanOrEqual(115);
    expect(res.bpm).toBeLessThanOrEqual(125);
  });

  it('detects key from pitch spectrum', () => {
    const sampleRate = 44100;
    const samples = new Float32Array(sampleRate * 4);

    // Generate A Minor chord (A4 440 Hz, C5 523.25 Hz, E5 659.25 Hz)
    const fA = 440;
    const fC = 523.25;
    const fE = 659.25;

    for (let i = 0; i < samples.length; i++) {
      const t = i / sampleRate;
      samples[i] =
        0.5 * Math.sin(2 * Math.PI * fA * t) +
        0.3 * Math.sin(2 * Math.PI * fC * t) +
        0.3 * Math.sin(2 * Math.PI * fE * t);
    }

    const res = detectKeyFromPcm(samples, sampleRate);
    expect(res.key).toBeDefined();
    expect(res.camelotKey).toBeDefined();
    expect(res.confidence).toBeGreaterThan(0);
  });

  it('reports null rather than a default when the signal is too short to analyse', () => {
    const sampleRate = 44100;
    const tooShort = new Float32Array(sampleRate);

    const bpm = detectBpmFromPcm(tooShort, sampleRate);
    expect(bpm.bpm).toBeNull();
    expect(bpm.confidence).toBe(0);

    const key = detectKeyFromPcm(new Float32Array(100), sampleRate);
    expect(key.key).toBeNull();
    expect(key.camelotKey).toBeNull();
    expect(key.confidence).toBe(0);
  });

  it('reports null rather than a default for silence', () => {
    const sampleRate = 22050;
    const silence = new Float32Array(sampleRate * 5);

    const bpm = detectBpmFromPcm(silence, sampleRate);
    expect(bpm.bpm).toBeNull();

    const key = detectKeyFromPcm(silence, sampleRate);
    expect(key.camelotKey).toBeNull();
  });

  it('scores a clean rhythmic pulse more confidently than noise', () => {
    const sampleRate = 22050;

    const pulse = new Float32Array(sampleRate * 10);
    const interval = Math.round((60 / 128) * sampleRate);
    for (let pos = 0; pos < pulse.length; pos += interval) {
      for (let i = 0; i < Math.min(Math.round(sampleRate * 0.05), pulse.length - pos); i++) {
        const env = 1 - i / (sampleRate * 0.05);
        pulse[pos + i] += Math.sin((2 * Math.PI * 80 * i) / sampleRate) * env;
      }
    }

    // Same waveform at a tenth of the amplitude. Confidence must not follow loudness, which is
    // what the old maxCorr * 10 formula did.
    const quiet = new Float32Array(pulse.length);
    for (let i = 0; i < pulse.length; i++) quiet[i] = pulse[i] * 0.1;

    const loudResult = detectBpmFromPcm(pulse, sampleRate);
    const quietResult = detectBpmFromPcm(quiet, sampleRate);

    expect(loudResult.bpm).toBe(quietResult.bpm);
    expect(Math.abs(loudResult.confidence - quietResult.confidence)).toBeLessThan(0.05);
  });
});

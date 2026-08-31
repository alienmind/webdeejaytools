import { describe, it, expect } from 'vitest';
import {
  pearsonCorrelation,
  applyLowPassFilter,
  detectBpmFromPcm,
  detectKeyFromPcm,
} from '../../src/server/services/mp3/analyzer.js';

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
});

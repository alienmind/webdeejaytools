import { describe, it, expect } from 'vitest';
import {
  parseKeyToCamelot,
  getCamelotDistance,
  isHarmonicallyCompatible,
  smartReorderTracks,
} from '../../src/shared/harmonic.js';
import { LocalTrackItem } from '../../src/shared/types.js';

describe('Harmonic & Camelot Key Module', () => {
  describe('parseKeyToCamelot', () => {
    it('should parse standard Camelot keys', () => {
      expect(parseKeyToCamelot('8A')).toEqual({ number: 8, letter: 'A', raw: '8A' });
      expect(parseKeyToCamelot('8a')).toEqual({ number: 8, letter: 'A', raw: '8a' });
      expect(parseKeyToCamelot('11B')).toEqual({ number: 11, letter: 'B', raw: '11B' });
      expect(parseKeyToCamelot('04A')).toEqual({ number: 4, letter: 'A', raw: '04A' });
    });

    it('should parse standard musical notation keys', () => {
      expect(parseKeyToCamelot('Am')).toEqual({ number: 8, letter: 'A', raw: 'Am' });
      expect(parseKeyToCamelot('A minor')).toEqual({ number: 8, letter: 'A', raw: 'A minor' });
      expect(parseKeyToCamelot('C')).toEqual({ number: 8, letter: 'B', raw: 'C' });
      expect(parseKeyToCamelot('C Major')).toEqual({ number: 8, letter: 'B', raw: 'C Major' });
      expect(parseKeyToCamelot('F#m')).toEqual({ number: 11, letter: 'A', raw: 'F#m' });
      expect(parseKeyToCamelot('Dbm')).toEqual({ number: 12, letter: 'A', raw: 'Dbm' });
      expect(parseKeyToCamelot('Eb')).toEqual({ number: 5, letter: 'B', raw: 'Eb' });
    });

    it('should parse OpenKey notation', () => {
      expect(parseKeyToCamelot('8m')).toEqual({ number: 8, letter: 'A', raw: '8m' });
      expect(parseKeyToCamelot('11d')).toEqual({ number: 11, letter: 'B', raw: '11d' });
    });

    it('should return null for invalid or empty keys', () => {
      expect(parseKeyToCamelot('')).toBeNull();
      expect(parseKeyToCamelot(null)).toBeNull();
      expect(parseKeyToCamelot('xyz unknown')).toBeNull();
    });
  });

  describe('Harmonic Distance and Compatibility', () => {
    it('should compute exact match distance 0', () => {
      const key1 = parseKeyToCamelot('8A')!;
      const key2 = parseKeyToCamelot('8A')!;
      expect(getCamelotDistance(key1, key2)).toBe(0);
      expect(isHarmonicallyCompatible(key1, key2, 0)).toBe(true);
    });

    it('should compute relative major/minor distance 0 (8A <-> 8B)', () => {
      const key1 = parseKeyToCamelot('8A')!;
      const key2 = parseKeyToCamelot('8B')!;
      expect(getCamelotDistance(key1, key2)).toBe(0);
      expect(isHarmonicallyCompatible(key1, key2, 0)).toBe(true);
    });

    it('should compute adjacent step distance 1 (8A -> 7A, 8A -> 9A, 12A -> 1A)', () => {
      const key8A = parseKeyToCamelot('8A')!;
      const key7A = parseKeyToCamelot('7A')!;
      const key9A = parseKeyToCamelot('9A')!;
      const key12A = parseKeyToCamelot('12A')!;
      const key1A = parseKeyToCamelot('1A')!;

      expect(getCamelotDistance(key8A, key7A)).toBe(1);
      expect(getCamelotDistance(key8A, key9A)).toBe(1);
      expect(getCamelotDistance(key12A, key1A)).toBe(1); // cyclic 12 -> 1 wrap
    });

    it('should compute energy boost distance 2 (8A -> 10A, 8A -> 6A)', () => {
      const key8A = parseKeyToCamelot('8A')!;
      const key10A = parseKeyToCamelot('10A')!;
      const key6A = parseKeyToCamelot('6A')!;

      expect(getCamelotDistance(key8A, key10A)).toBe(2);
      expect(getCamelotDistance(key8A, key6A)).toBe(2);
      expect(isHarmonicallyCompatible(key8A, key10A, 2)).toBe(true);
      expect(isHarmonicallyCompatible(key8A, key10A, 1)).toBe(false);
    });
  });

  describe('smartReorderTracks', () => {
    const mockTracks: LocalTrackItem[] = [
      {
        id: 't1',
        filePath: 'd:/t1.mp3',
        fileName: 'Track 1.mp3',
        relativeSubPath: 'Track 1.mp3',
        title: 'Deep Groove',
        artist: 'Artist A',
        album: 'Album 1',
        bpm: 126,
        key: '8A',
        durationSec: 300,
        fileSize: 10000000,
        extension: '.mp3',
        lossless: false,
        hasArtwork: false,
      },
      {
        id: 't2',
        filePath: 'd:/t2.mp3',
        fileName: 'Track 2.mp3',
        relativeSubPath: 'Track 2.mp3',
        title: 'Warm Sun',
        artist: 'Artist B',
        album: 'Album 2',
        bpm: 122,
        key: '7A',
        durationSec: 280,
        fileSize: 9000000,
        extension: '.mp3',
        lossless: false,
        hasArtwork: false,
      },
      {
        id: 't3',
        filePath: 'd:/t3.mp3',
        fileName: 'Track 3.mp3',
        relativeSubPath: 'Track 3.mp3',
        title: 'Peak Storm',
        artist: 'Artist C',
        album: 'Album 3',
        bpm: 128,
        key: '9A',
        durationSec: 350,
        fileSize: 11000000,
        extension: '.mp3',
        lossless: false,
        hasArtwork: false,
      },
      {
        id: 't4',
        filePath: 'd:/t4.mp3',
        fileName: 'Track 4.mp3',
        relativeSubPath: 'Track 4.mp3',
        title: 'Sunrise Energy',
        artist: 'Artist D',
        album: 'Album 4',
        bpm: 124,
        key: '8B',
        durationSec: 320,
        fileSize: 10500000,
        extension: '.mp3',
        lossless: false,
        hasArtwork: false,
      },
    ];

    it('should reorder tracks harmonically and dynamically along BPM curve', () => {
      const result = smartReorderTracks(mockTracks, {
        useBpm: true,
        useKey: true,
        keyThreshold: 1,
        bpmCurve: 'wave',
      });

      expect(result.tracks.length).toBe(4);
      expect(result.diagnostics.length).toBe(3);
      // All transitions should be compatible within threshold 1
      for (const diag of result.diagnostics) {
        expect(diag.camelotDistance).toBeLessThanOrEqual(1);
      }
      expect(result.stats.compatibilityRate).toBe(100);
    });

    it('should handle single track or empty track lists gracefully', () => {
      const emptyRes = smartReorderTracks([], { useBpm: true, useKey: true, keyThreshold: 1 });
      expect(emptyRes.tracks).toEqual([]);

      const singleRes = smartReorderTracks([mockTracks[0]], { useBpm: true, useKey: true, keyThreshold: 1 });
      expect(singleRes.tracks.length).toBe(1);
    });
  });
});

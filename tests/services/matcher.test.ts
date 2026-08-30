import { describe, it, expect } from 'vitest';
import { cleanText, cleanArtist } from '../../src/server/services/matcher/cleaner.js';
import { evaluateTrackMatch, findBestMatch } from '../../src/server/services/matcher/engine.js';
import { TrackItem } from '../../src/shared/types.js';

describe('Matcher Cleaner', () => {
  it('should strip remastered tags from titles', () => {
    expect(cleanText('Hotel California (2013 Remaster)')).toBe('hotel california');
    expect(cleanText('Come Together [2019 Remastered Version]')).toBe('come together');
    expect(cleanText('Starman (Deluxe Edition)')).toBe('starman');
  });

  it('should clean club mix / edit tags', () => {
    expect(cleanText('Satisfaction (Original Mix)')).toBe('satisfaction');
    expect(cleanText('Around the World [Radio Edit]')).toBe('around the world');
  });

  it('should remove accents and normalize artist names', () => {
    expect(cleanArtist('Beyoncé feat. Jay-Z')).toBe('beyonce jay z');
    expect(cleanArtist('Daft Punk / Pharrell Williams')).toBe('daft punk pharrell williams');
  });
});

describe('Matching Engine', () => {
  const sourceTrack: TrackItem = {
    id: 'src_1',
    service: 'spotify',
    title: 'Blue Monday (2016 Remaster)',
    artist: 'New Order',
    album: 'Substance',
    durationMs: 449000,
    isrc: 'GBAAP0200501',
  };

  it('should match 100% exact on ISRC', () => {
    const candidate: TrackItem = {
      id: 'qobuz_1',
      service: 'qobuz',
      title: 'Blue Monday',
      artist: 'New Order',
      album: 'Substance 1987',
      durationMs: 449200,
      isrc: 'GBAAP0200501',
    };

    const match = evaluateTrackMatch(sourceTrack, candidate);
    expect(match.confidenceScore).toBe(100);
    expect(match.status).toBe('exact');
  });

  it('should fuzzy match cleaned title and artist without ISRC', () => {
    const sourceNoIsrc: TrackItem = {
      ...sourceTrack,
      isrc: undefined,
    };

    const candidate: TrackItem = {
      id: 'qobuz_2',
      service: 'qobuz',
      title: 'Blue Monday (Original Mix)',
      artist: 'New Order',
      album: 'Power, Corruption & Lies',
      durationMs: 448500,
    };

    const match = evaluateTrackMatch(sourceNoIsrc, candidate);
    expect(match.confidenceScore).toBeGreaterThanOrEqual(90);
    expect(['exact', 'high_confidence']).toContain(match.status);
  });

  it('should penalize tracks with large duration discrepancy', () => {
    const candidateShort: TrackItem = {
      id: 'qobuz_short',
      service: 'qobuz',
      title: 'Blue Monday',
      artist: 'New Order',
      album: 'Short Edits',
      durationMs: 180000, // 3 minutes vs 7.5 minutes
    };

    const match = evaluateTrackMatch({ ...sourceTrack, isrc: undefined }, candidateShort);
    expect(match.confidenceScore).toBeLessThan(80);
    expect(match.reason).toContain('Large duration discrepancy');
  });

  it('findBestMatch should select the highest confidence candidate', () => {
    const candidate1: TrackItem = {
      id: 'c1',
      service: 'qobuz',
      title: 'Blue Monday (Live in Paris)',
      artist: 'New Order',
      album: 'Live 1989',
      durationMs: 300000,
    };

    const candidate2: TrackItem = {
      id: 'c2',
      service: 'qobuz',
      title: 'Blue Monday',
      artist: 'New Order',
      album: 'Substance',
      durationMs: 449000,
      isrc: 'GBAAP0200501',
    };

    const best = findBestMatch(sourceTrack, [candidate1, candidate2]);
    expect(best.targetTrack?.id).toBe('c2');
    expect(best.status).toBe('exact');
    expect(best.confidenceScore).toBe(100);
  });
});

import { LocalTrackItem } from './types.js';

export interface CamelotKey {
  number: number; // 1 to 12
  letter: 'A' | 'B'; // 'A' = Minor, 'B' = Major
  raw?: string;
}

export interface SmartReorderOptions {
  useBpm: boolean;
  useKey: boolean;
  keyThreshold: 0 | 1 | 2; // 0 = Exact/Relative (same number), 1 = Adjacent (+-1 step), 2 = Energy boost (+-2 steps)
  bpmCurve?: 'wave' | 'ascending' | 'harmonic_first';
}

export interface TransitionDiagnostic {
  fromIndex: number;
  toIndex: number;
  fromTrackId: string;
  toTrackId: string;
  fromKey?: string;
  toKey?: string;
  fromBpm?: number;
  toBpm?: number;
  bpmDiff?: number;
  camelotDistance?: number;
  transitionType: 'exact' | 'relative' | 'adjacent' | 'energy_boost' | 'incompatible' | 'unknown';
  description: string;
}

export interface SmartReorderResult {
  tracks: LocalTrackItem[];
  diagnostics: TransitionDiagnostic[];
  stats: {
    compatibleTransitions: number;
    totalTransitions: number;
    compatibilityRate: number; // 0 to 100 %
    avgBpmDelta: number;
  };
}

/**
 * Standard Musical Key to Camelot Mapping
 */
const MUSICAL_KEY_TO_CAMELOT: Record<string, { number: number; letter: 'A' | 'B' }> = {
  // Minor Keys (A)
  'abm': { number: 1, letter: 'A' },
  'ab minor': { number: 1, letter: 'A' },
  'g#m': { number: 1, letter: 'A' },
  'g# minor': { number: 1, letter: 'A' },
  'ebm': { number: 2, letter: 'A' },
  'eb minor': { number: 2, letter: 'A' },
  'd#m': { number: 2, letter: 'A' },
  'd# minor': { number: 2, letter: 'A' },
  'bbm': { number: 3, letter: 'A' },
  'bb minor': { number: 3, letter: 'A' },
  'a#m': { number: 3, letter: 'A' },
  'a# minor': { number: 3, letter: 'A' },
  'fm': { number: 4, letter: 'A' },
  'f minor': { number: 4, letter: 'A' },
  'cm': { number: 5, letter: 'A' },
  'c minor': { number: 5, letter: 'A' },
  'gm': { number: 6, letter: 'A' },
  'g minor': { number: 6, letter: 'A' },
  'dm': { number: 7, letter: 'A' },
  'd minor': { number: 7, letter: 'A' },
  'am': { number: 8, letter: 'A' },
  'a minor': { number: 8, letter: 'A' },
  'em': { number: 9, letter: 'A' },
  'e minor': { number: 9, letter: 'A' },
  'bm': { number: 10, letter: 'A' },
  'b minor': { number: 10, letter: 'A' },
  'f#m': { number: 11, letter: 'A' },
  'f# minor': { number: 11, letter: 'A' },
  'gbm': { number: 11, letter: 'A' },
  'gb minor': { number: 11, letter: 'A' },
  'c#m': { number: 12, letter: 'A' },
  'c# minor': { number: 12, letter: 'A' },
  'dbm': { number: 12, letter: 'A' },
  'db minor': { number: 12, letter: 'A' },

  // Major Keys (B)
  'b': { number: 1, letter: 'B' },
  'b maj': { number: 1, letter: 'B' },
  'b major': { number: 1, letter: 'B' },
  'f#': { number: 2, letter: 'B' },
  'f# maj': { number: 2, letter: 'B' },
  'f# major': { number: 2, letter: 'B' },
  'gb': { number: 2, letter: 'B' },
  'gb maj': { number: 2, letter: 'B' },
  'gb major': { number: 2, letter: 'B' },
  'db': { number: 3, letter: 'B' },
  'db maj': { number: 3, letter: 'B' },
  'db major': { number: 3, letter: 'B' },
  'c#': { number: 3, letter: 'B' },
  'c# maj': { number: 3, letter: 'B' },
  'c# major': { number: 3, letter: 'B' },
  'ab': { number: 4, letter: 'B' },
  'ab maj': { number: 4, letter: 'B' },
  'ab major': { number: 4, letter: 'B' },
  'g#': { number: 4, letter: 'B' },
  'g# maj': { number: 4, letter: 'B' },
  'g# major': { number: 4, letter: 'B' },
  'eb': { number: 5, letter: 'B' },
  'eb maj': { number: 5, letter: 'B' },
  'eb major': { number: 5, letter: 'B' },
  'd#': { number: 5, letter: 'B' },
  'd# maj': { number: 5, letter: 'B' },
  'd# major': { number: 5, letter: 'B' },
  'bb': { number: 6, letter: 'B' },
  'bb maj': { number: 6, letter: 'B' },
  'bb major': { number: 6, letter: 'B' },
  'a#': { number: 6, letter: 'B' },
  'a# maj': { number: 6, letter: 'B' },
  'a# major': { number: 6, letter: 'B' },
  'f': { number: 7, letter: 'B' },
  'f maj': { number: 7, letter: 'B' },
  'f major': { number: 7, letter: 'B' },
  'c': { number: 8, letter: 'B' },
  'c maj': { number: 8, letter: 'B' },
  'c major': { number: 8, letter: 'B' },
  'g': { number: 9, letter: 'B' },
  'g maj': { number: 9, letter: 'B' },
  'g major': { number: 9, letter: 'B' },
  'd': { number: 10, letter: 'B' },
  'd maj': { number: 10, letter: 'B' },
  'd major': { number: 10, letter: 'B' },
  'a': { number: 11, letter: 'B' },
  'a maj': { number: 11, letter: 'B' },
  'a major': { number: 11, letter: 'B' },
  'e': { number: 12, letter: 'B' },
  'e maj': { number: 12, letter: 'B' },
  'e major': { number: 12, letter: 'B' },
};

/**
 * Open Key to Camelot Mapping (1m-12m -> 1A-12A, 1d-12d -> 1B-12B)
 */
const OPEN_KEY_MAP: Record<string, { number: number; letter: 'A' | 'B' }> = {
  // Minor (m -> A)
  '1m': { number: 1, letter: 'A' },
  '2m': { number: 2, letter: 'A' },
  '3m': { number: 3, letter: 'A' },
  '4m': { number: 4, letter: 'A' },
  '5m': { number: 5, letter: 'A' },
  '6m': { number: 6, letter: 'A' },
  '7m': { number: 7, letter: 'A' },
  '8m': { number: 8, letter: 'A' },
  '9m': { number: 9, letter: 'A' },
  '10m': { number: 10, letter: 'A' },
  '11m': { number: 11, letter: 'A' },
  '12m': { number: 12, letter: 'A' },
  // Major (d -> B)
  '1d': { number: 1, letter: 'B' },
  '2d': { number: 2, letter: 'B' },
  '3d': { number: 3, letter: 'B' },
  '4d': { number: 4, letter: 'B' },
  '5d': { number: 5, letter: 'B' },
  '6d': { number: 6, letter: 'B' },
  '7d': { number: 7, letter: 'B' },
  '8d': { number: 8, letter: 'B' },
  '9d': { number: 9, letter: 'B' },
  '10d': { number: 10, letter: 'B' },
  '11d': { number: 11, letter: 'B' },
  '12d': { number: 12, letter: 'B' },
};

/**
 * Parses any musical key string into a normalized Camelot Key object.
 * Supports Camelot codes ("8A", "11B"), Standard keys ("Am", "C# minor", "F#"), and OpenKey ("4m", "8d").
 */
export function parseKeyToCamelot(rawKey?: string | null): CamelotKey | null {
  if (!rawKey || typeof rawKey !== 'string') return null;

  const clean = rawKey.trim().toLowerCase().replace(/[^\w#]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return null;

  // 1. Direct Camelot Pattern (e.g., "8a", "11b", "08A")
  const camelotMatch = clean.match(/^0?([1-9]|1[0-2])\s*([ab])$/i);
  if (camelotMatch) {
    const num = parseInt(camelotMatch[1], 10);
    const letter = camelotMatch[2].toUpperCase() as 'A' | 'B';
    return { number: num, letter, raw: rawKey };
  }

  // 2. Open Key Pattern (e.g. "8m", "11d")
  const noSpace = clean.replace(/\s+/g, '');
  if (OPEN_KEY_MAP[noSpace]) {
    const mapped = OPEN_KEY_MAP[noSpace];
    return { number: mapped.number, letter: mapped.letter, raw: rawKey };
  }

  // 3. Musical Key Map Lookup
  if (MUSICAL_KEY_TO_CAMELOT[clean]) {
    const mapped = MUSICAL_KEY_TO_CAMELOT[clean];
    return { number: mapped.number, letter: mapped.letter, raw: rawKey };
  }

  // 4. Try without whitespace
  if (MUSICAL_KEY_TO_CAMELOT[noSpace]) {
    const mapped = MUSICAL_KEY_TO_CAMELOT[noSpace];
    return { number: mapped.number, letter: mapped.letter, raw: rawKey };
  }

  return null;
}

/**
 * Returns formatted Camelot string e.g. "8A"
 */
export function formatCamelotKey(key: CamelotKey | null): string {
  if (!key) return '—';
  return `${key.number}${key.letter}`;
}

/**
 * Computes shortest cyclic step distance on the 12-hour Camelot wheel.
 * Clock distance: 0 (same number), 1 (adjacent +-1), 2 (+-2), up to 6.
 */
export function getCamelotHourDistance(numA: number, numB: number): number {
  const diff = Math.abs(numA - numB) % 12;
  return Math.min(diff, 12 - diff);
}

/**
 * Computes harmonic compatibility distance between two Camelot keys:
 * - 0: Same key (8A -> 8A) OR Relative Major/Minor (8A <-> 8B)
 * - 1: Adjacent key on same ring (+-1 step, e.g. 8A -> 7A or 9A) OR Diagonal (+-1 step + mode shift)
 * - 2: Energy boost (+2 steps, e.g. 8A -> 10A) or energy drop (-2 steps, e.g. 8A -> 6A)
 * - > 2: Incompatible distance (3, 4, 5, 6)
 */
export function getCamelotDistance(keyA: CamelotKey, keyB: CamelotKey): number {
  const hourDist = getCamelotHourDistance(keyA.number, keyB.number);

  if (keyA.letter === keyB.letter) {
    // Same mode (both Minor or both Major)
    return hourDist;
  } else {
    // Mode shift (Minor <-> Major)
    // Same number is relative major/minor -> Distance 0
    if (hourDist === 0) return 0;
    // Diagonal +-1 is step distance 1
    if (hourDist === 1) return 1;
    // Otherwise hourDist
    return hourDist;
  }
}

/**
 * Checks if two keys meet the allowed step threshold (0, 1, or 2).
 */
export function isHarmonicallyCompatible(
  keyA: CamelotKey | null,
  keyB: CamelotKey | null,
  maxThreshold: 0 | 1 | 2 = 1
): boolean {
  if (!keyA || !keyB) return true; // Missing key metadata doesn't hard-block
  const dist = getCamelotDistance(keyA, keyB);
  return dist <= maxThreshold;
}

/**
 * Describes the musical nature of the transition between two Camelot keys.
 */
export function describeTransition(
  keyA: CamelotKey | null,
  keyB: CamelotKey | null,
  bpmA?: number,
  bpmB?: number
): {
  type: TransitionDiagnostic['transitionType'];
  description: string;
  distance: number;
} {
  if (!keyA || !keyB) {
    const bpmTxt = bpmA && bpmB ? `BPM: ${bpmA} -> ${bpmB} (${bpmB - bpmA >= 0 ? '+' : ''}${(bpmB - bpmA).toFixed(1)})` : 'Untagged Key';
    return { type: 'unknown', description: bpmTxt, distance: 0 };
  }

  const hourDist = getCamelotHourDistance(keyA.number, keyB.number);
  const sameMode = keyA.letter === keyB.letter;

  if (keyA.number === keyB.number && sameMode) {
    return { type: 'exact', description: `Exact Match (${formatCamelotKey(keyA)})`, distance: 0 };
  }

  if (keyA.number === keyB.number && !sameMode) {
    return {
      type: 'relative',
      description: `Relative ${keyB.letter === 'B' ? 'Major' : 'Minor'} (${formatCamelotKey(keyA)} -> ${formatCamelotKey(keyB)})`,
      distance: 0,
    };
  }

  if (hourDist === 1 && sameMode) {
    const isUp = (keyA.number % 12) + 1 === keyB.number || (keyA.number === 12 && keyB.number === 1);
    return {
      type: 'adjacent',
      description: `Adjacent ${isUp ? '+1 (Lift)' : '-1 (Warm)'} (${formatCamelotKey(keyA)} -> ${formatCamelotKey(keyB)})`,
      distance: 1,
    };
  }

  if (hourDist === 1 && !sameMode) {
    return {
      type: 'adjacent',
      description: `Diagonal +/-1 (${formatCamelotKey(keyA)} -> ${formatCamelotKey(keyB)})`,
      distance: 1,
    };
  }

  if (hourDist === 2) {
    return {
      type: 'energy_boost',
      description: `Energy Shift +/-2 (${formatCamelotKey(keyA)} -> ${formatCamelotKey(keyB)})`,
      distance: 2,
    };
  }

  return {
    type: 'incompatible',
    description: `Key Leap (${formatCamelotKey(keyA)} -> ${formatCamelotKey(keyB)}, ${hourDist} steps)`,
    distance: hourDist,
  };
}

/**
 * Smart DJ Set Reordering Engine:
 * Generates an optimal DJ set playlist sequence respecting Camelot harmonic mixing
 * and dynamic BPM wave curves.
 */
export function smartReorderTracks(
  tracks: LocalTrackItem[],
  options: SmartReorderOptions
): SmartReorderResult {
  if (tracks.length <= 1) {
    return {
      tracks: [...tracks],
      diagnostics: [],
      stats: { compatibleTransitions: 0, totalTransitions: 0, compatibilityRate: 100, avgBpmDelta: 0 },
    };
  }

  // Pre-parse Camelot keys
  const parsedTracks = tracks.map((t) => ({
    track: t,
    camelot: parseKeyToCamelot(t.key),
    bpm: t.bpm && t.bpm > 0 ? t.bpm : null,
  }));

  // Determine starting anchor track:
  // If BPM is enabled, sort by BPM to start with lower energy
  let workingList = [...parsedTracks];
  
  if (options.useBpm) {
    workingList.sort((a, b) => {
      if (a.bpm !== null && b.bpm !== null) return a.bpm - b.bpm;
      if (a.bpm !== null) return -1;
      if (b.bpm !== null) return 1;
      return 0;
    });
  }

  const resultList: typeof parsedTracks = [];
  const remaining = [...workingList];

  // Pick first track as anchor
  const firstTrack = remaining.shift()!;
  resultList.push(firstTrack);

  // Target BPM curve generator helper
  const totalCount = tracks.length;
  const validBpms = tracks.map((t) => t.bpm || 0).filter((b) => b > 0);
  const minBpm = validBpms.length > 0 ? Math.min(...validBpms) : 120;
  const maxBpm = validBpms.length > 0 ? Math.max(...validBpms) : 128;
  const bpmRange = Math.max(1, maxBpm - minBpm);

  const getTargetBpmForIndex = (index: number): number => {
    if (options.bpmCurve === 'ascending') {
      return minBpm + (index / Math.max(1, totalCount - 1)) * bpmRange;
    }
    // Default 'wave' curve: triangular / sinusoidal energy wave climbing upwards
    const progress = index / Math.max(1, totalCount - 1);
    const baseRamp = minBpm + progress * bpmRange;
    // Micro wave cycle every 4 tracks
    const waveOffset = Math.sin((index / 4) * Math.PI * 2) * Math.min(2.5, bpmRange * 0.15);
    return baseRamp + waveOffset;
  };

  // Greedy best-fit sequence pathfinding
  while (remaining.length > 0) {
    const current = resultList[resultList.length - 1];
    const targetBpm = getTargetBpmForIndex(resultList.length);

    let bestCandidateIndex = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      let score = 1000;

      // 1. Harmonic Key Scoring
      if (options.useKey && current.camelot && candidate.camelot) {
        const dist = getCamelotDistance(current.camelot, candidate.camelot);
        if (dist <= options.keyThreshold) {
          if (dist === 0) score += 500; // Perfect match / relative major-minor
          else if (dist === 1) score += 350; // Adjacent +-1
          else if (dist === 2) score += 200; // Energy shift
        } else {
          // Penalty for exceeding key threshold
          score -= (dist - options.keyThreshold) * 300;
        }
      } else if (options.useKey && (!current.camelot || !candidate.camelot)) {
        // Neutral score for untagged tracks
        score += 50;
      }

      // 2. BPM Scoring
      if (options.useBpm) {
        if (candidate.bpm !== null && current.bpm !== null) {
          const bpmDiff = Math.abs(candidate.bpm - current.bpm);
          const targetDiff = Math.abs(candidate.bpm - targetBpm);

          // Penalize harsh jumps > 6 BPM
          if (bpmDiff > 8) {
            score -= (bpmDiff - 8) * 40;
          } else {
            score += Math.max(0, (8 - bpmDiff) * 20);
          }

          // Bonus for matching current wave target
          score -= targetDiff * 15;
        } else {
          score += 10;
        }
      }

      // 3. Artist Variety Bonus (slight penalty for consecutive same artist)
      if (candidate.track.artist && current.track.artist && candidate.track.artist.toLowerCase() === current.track.artist.toLowerCase()) {
        score -= 80;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidateIndex = i;
      }
    }

    const [chosen] = remaining.splice(bestCandidateIndex, 1);
    resultList.push(chosen);
  }

  // Generate diagnostics and metrics
  const diagnostics: TransitionDiagnostic[] = [];
  let compatibleCount = 0;
  let totalBpmDelta = 0;
  let bpmDeltaCount = 0;

  for (let i = 0; i < resultList.length - 1; i++) {
    const from = resultList[i];
    const to = resultList[i + 1];
    const info = describeTransition(from.camelot, to.camelot, from.bpm || undefined, to.bpm || undefined);

    const bpmDiff = from.bpm && to.bpm ? +(to.bpm - from.bpm).toFixed(1) : undefined;
    if (bpmDiff !== undefined) {
      totalBpmDelta += Math.abs(bpmDiff);
      bpmDeltaCount++;
    }

    const isCompatible = info.distance <= options.keyThreshold;
    if (isCompatible) {
      compatibleCount++;
    }

    diagnostics.push({
      fromIndex: i,
      toIndex: i + 1,
      fromTrackId: from.track.id,
      toTrackId: to.track.id,
      fromKey: from.track.key || undefined,
      toKey: to.track.key || undefined,
      fromBpm: from.bpm || undefined,
      toBpm: to.bpm || undefined,
      bpmDiff,
      camelotDistance: info.distance,
      transitionType: info.type,
      description: info.description,
    });
  }

  const totalTransitions = resultList.length - 1;
  const compatibilityRate = totalTransitions > 0 ? Math.round((compatibleCount / totalTransitions) * 100) : 100;
  const avgBpmDelta = bpmDeltaCount > 0 ? +(totalBpmDelta / bpmDeltaCount).toFixed(1) : 0;

  return {
    tracks: resultList.map((item) => item.track),
    diagnostics,
    stats: {
      compatibleTransitions: compatibleCount,
      totalTransitions,
      compatibilityRate,
      avgBpmDelta,
    },
  };
}

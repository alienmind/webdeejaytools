import { MatchOptions, MatchStatus, TrackItem, TrackMatch } from '../../../shared/types.js';
import { cleanArtist, cleanText } from './cleaner.js';

export function levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= bn; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= an; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[bn][an];
}

export function stringSimilarity(s1: string, s2: string): number {
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;

  const dist = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  return Math.max(0, 1 - dist / maxLen);
}

export function tokenOverlapScore(s1: string, s2: string): number {
  const tokens1 = new Set(s1.split(/\s+/).filter(Boolean));
  const tokens2 = new Set(s2.split(/\s+/).filter(Boolean));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }

  const union = new Set([...tokens1, ...tokens2]).size;
  return union === 0 ? 0 : intersection / union;
}

export interface MatchScoreResult {
  confidenceScore: number;
  status: MatchStatus;
  reason: string;
}

export function evaluateTrackMatch(
  source: TrackItem,
  candidate: TrackItem,
  options: MatchOptions = { durationToleranceSec: 5, strictIsrcOnly: false, minConfidenceScore: 65 }
): MatchScoreResult {
  // Tier 1: Exact ISRC Match
  if (source.isrc && candidate.isrc && source.isrc.trim().toUpperCase() === candidate.isrc.trim().toUpperCase()) {
    return {
      confidenceScore: 100,
      status: 'exact',
      reason: `Exact ISRC Match: ${source.isrc}`,
    };
  }

  if (options.strictIsrcOnly) {
    return {
      confidenceScore: 0,
      status: 'miss',
      reason: 'ISRC did not match and strict ISRC mode is enabled',
    };
  }

  const sourceTitleClean = cleanText(source.title);
  const candTitleClean = cleanText(candidate.title);
  const sourceArtistClean = cleanArtist(source.artist);
  const candArtistClean = cleanArtist(candidate.artist);

  // Tier 2: Cleaned exact title and artist
  const titleExact = sourceTitleClean === candTitleClean;
  const artistExact = sourceArtistClean === candArtistClean;

  let score = 0;
  let reason = '';

  if (titleExact && artistExact) {
    score = 96;
    reason = 'Exact match on cleaned Title & Artist';
  } else {
    // Tier 3: Fuzzy token and Levenshtein similarity
    const titleSim = stringSimilarity(sourceTitleClean, candTitleClean);
    const artistSim = stringSimilarity(sourceArtistClean, candArtistClean);
    const tokenOverlap = tokenOverlapScore(`${sourceArtistClean} ${sourceTitleClean}`, `${candArtistClean} ${candTitleClean}`);

    // Combined text score (weighted 50% title, 30% artist, 20% token overlap)
    score = (titleSim * 0.5 + artistSim * 0.3 + tokenOverlap * 0.2) * 100;
    reason = `Fuzzy match (Title: ${(titleSim * 100).toFixed(0)}%, Artist: ${(artistSim * 100).toFixed(0)}%)`;
  }

  // Tier 4: Duration delta evaluation
  if (source.durationMs > 0 && candidate.durationMs > 0) {
    const deltaSec = Math.abs(source.durationMs - candidate.durationMs) / 1000;

    if (deltaSec <= options.durationToleranceSec) {
      score = Math.min(100, score + 4);
      reason += ` | Duration delta: ${deltaSec.toFixed(1)}s (Bonus)`;
    } else if (deltaSec <= 15) {
      // Nominal
      reason += ` | Duration delta: ${deltaSec.toFixed(1)}s`;
    } else if (deltaSec > 30) {
      score = Math.max(0, score - 25);
      reason += ` | Large duration discrepancy: ${deltaSec.toFixed(1)}s (-25 Penalty)`;
    } else {
      score = Math.max(0, score - 10);
      reason += ` | Duration delta: ${deltaSec.toFixed(1)}s (-10 Penalty)`;
    }
  }

  score = Math.round(score);

  let status: MatchStatus = 'miss';
  if (score >= 95) {
    status = 'exact';
  } else if (score >= 85) {
    status = 'high_confidence';
  } else if (score >= options.minConfidenceScore) {
    status = 'fuzzy';
  } else {
    status = 'miss';
  }

  return {
    confidenceScore: score,
    status,
    reason,
  };
}

export function findBestMatch(
  source: TrackItem,
  candidates: TrackItem[],
  options?: MatchOptions
): TrackMatch {
  if (!candidates || candidates.length === 0) {
    return {
      sourceTrack: source,
      status: 'miss',
      confidenceScore: 0,
      reason: 'No catalog candidates found',
    };
  }

  let bestCandidate: TrackItem | undefined;
  let bestScore = -1;
  let bestStatus: MatchStatus = 'miss';
  let bestReason = 'No candidate met threshold';

  for (const candidate of candidates) {
    const result = evaluateTrackMatch(source, candidate, options);
    if (result.confidenceScore > bestScore) {
      bestScore = result.confidenceScore;
      bestStatus = result.status;
      bestReason = result.reason;
      bestCandidate = candidate;
    }
  }

  const minScore = options?.minConfidenceScore ?? 65;
  if (bestScore < minScore || bestStatus === 'miss') {
    return {
      sourceTrack: source,
      targetTrack: bestCandidate,
      status: 'miss',
      confidenceScore: Math.max(0, bestScore),
      reason: bestReason,
    };
  }

  return {
    sourceTrack: source,
    targetTrack: bestCandidate,
    status: bestStatus,
    confidenceScore: bestScore,
    reason: bestReason,
  };
}

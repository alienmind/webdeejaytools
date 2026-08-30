/**
 * Cleans track titles, artist names, and album names for robust fuzzy matching.
 */

// Noise words in titles
const REMOVAL_PATTERNS = [
  // Remaster tags
  /\s*[\(\[]\s*(\d{4}\s+)?remaster(ed)?(\s+version)?(\s+\d{4})?\s*[\)\]]/gi,
  /\s*[\(\[]\s*deluxe(\s+edition)?\s*[\)\]]/gi,
  /\s*[\(\[]\s*anniversary(\s+edition)?\s*[\)\]]/gi,
  /\s*[\(\[]\s*expanded(\s+edition)?\s*[\)\]]/gi,
  /\s*[\(\[]\s*bonus(\s+track)?\s*[\)\]]/gi,
  
  // Mix and edit variations (keep track of mix if needed, but strip for baseline title matching)
  /\s*[\(\[]\s*original\s+mix\s*[\)\]]/gi,
  /\s*[\(\[]\s*radio\s+edit\s*[\)\]]/gi,
  /\s*[\(\[]\s*extended\s+mix\s*[\)\]]/gi,
  /\s*[\(\[]\s*club\s+mix\s*[\)\]]/gi,
  /\s*[\(\[]\s*album\s+version\s*[\)\]]/gi,
  /\s*[\(\[]\s*single\s+version\s*[\)\]]/gi,
  /\s*[\(\[]\s*instrumental(\s+mix|\s+version)?\s*[\)\]]/gi,
  /\s*[\(\[]\s*live(\s+at\s+[^\]\)]+)?\s*[\)\]]/gi,

  // Feat / Ft in title parentheses
  /\s*[\(\[]\s*(feat|ft|featuring)\.?\s+[^\]\)]+[\)\]]/gi,
  /\s+(feat|ft|featuring)\.?\s+.*$/gi,

  // Mono / Stereo tags
  /\s*[\(\[]\s*(stereo|mono)\s*[\)\]]/gi,
];

export function cleanText(input: string): string {
  if (!input) return '';

  let text = input;

  // Apply removal patterns
  for (const pattern of REMOVAL_PATTERNS) {
    text = text.replace(pattern, '');
  }

  // Remove diacritics / accents (e.g. Café -> Cafe)
  text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Lowercase and remove punctuation except spaces and alphanumeric
  text = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

export function cleanArtist(artist: string): string {
  if (!artist) return '';
  let text = artist.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Split multiple artists (e.g., "Artist A, Artist B", "Artist A & Artist B", "Artist A feat. Artist B")
  text = text.replace(/\s+(feat\.|ft\.|featuring|&|\/|,)\s+/gi, ' ');
  return cleanText(text);
}

export function buildSearchQuery(artist: string, title: string): string {
  const cleanA = cleanArtist(artist).split(' ')[0] || ''; // Primary artist first word
  const cleanT = cleanText(title);
  return `${cleanA} ${cleanT}`.trim();
}

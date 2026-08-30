import fs from 'fs';
import path from 'path';
import { TrackItem } from '../../../shared/types.js';

export interface M3uEntry {
  track: TrackItem;
  filePath: string;
}

export function generateM3uPlaylist(
  playlistPath: string,
  playlistTitle: string,
  entries: M3uEntry[]
): void {
  const dir = path.dirname(playlistPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lines: string[] = ['#EXTM3U', `#PLAYLIST:${playlistTitle}`];

  for (const entry of entries) {
    const durationSec = Math.round(entry.track.durationMs / 1000);
    const artist = entry.track.artist || 'Unknown Artist';
    const title = entry.track.title || 'Unknown Title';
    
    // Calculate relative path from playlist file directory to track file
    const relPath = path.relative(dir, entry.filePath).replace(/\\/g, '/');

    lines.push(`#EXTINF:${durationSec},${artist} - ${title}`);
    lines.push(relPath);
  }

  fs.writeFileSync(playlistPath, lines.join('\n'), 'utf-8');
}

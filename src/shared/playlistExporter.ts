import { LocalTrackItem } from './types.js';
import { parseKeyToCamelot, formatCamelotKey } from './harmonic.js';

export type PlaylistExportFormat = 'm3u8' | 'm3u' | 'rekordbox_xml' | 'csv' | 'txt' | 'json';

export interface PlaylistExportOptions {
  playlistName: string;
  format: PlaylistExportFormat;
  useRelativePaths: boolean;
  baseDirectory?: string;
  includeHarmonicInfoInTitle?: boolean;
}

/**
 * Generate M3U / M3U8 Extended playlist text
 */
export function generateM3uPlaylist(
  tracks: LocalTrackItem[],
  options: PlaylistExportOptions
): string {
  const lines: string[] = [];
  lines.push('#EXTM3U');
  if (options.playlistName) {
    lines.push(`#PLAYLIST:${options.playlistName}`);
  }

  for (const track of tracks) {
    const duration = Math.round(track.durationSec || 0);
    let titleString = `${track.artist} - ${track.title}`;
    if (options.includeHarmonicInfoInTitle) {
      const camelot = parseKeyToCamelot(track.key);
      const tags: string[] = [];
      if (camelot) tags.push(formatCamelotKey(camelot));
      if (track.bpm) tags.push(`${track.bpm} BPM`);
      if (tags.length > 0) {
        titleString += ` [${tags.join(' | ')}]`;
      }
    }

    lines.push(`#EXTINF:${duration},${titleString}`);

    let trackPath = track.filePath;
    if (options.useRelativePaths && track.relativeSubPath) {
      // Use relative path with forward slashes for cross-platform portability
      trackPath = track.relativeSubPath.replace(/\\/g, '/');
    }
    lines.push(trackPath);
  }

  return lines.join('\n');
}

/**
 * Generate Pioneer Rekordbox XML bridge playlist
 */
export function generateRekordboxXml(
  tracks: LocalTrackItem[],
  options: PlaylistExportOptions
): string {
  const escapeXml = (unsafe: string = '') =>
    unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const trackEntries: string[] = [];
  const playlistTracks: string[] = [];

  tracks.forEach((track, idx) => {
    const trackId = idx + 1;
    const camelot = parseKeyToCamelot(track.key);
    const tonality = camelot ? formatCamelotKey(camelot) : track.key || '';
    const bpm = track.bpm ? track.bpm.toFixed(2) : '';
    const duration = Math.round(track.durationSec || 0);
    const size = track.fileSize || 0;
    const bitrate = track.bitrate || 320;
    const fileUrl = 'file://localhost/' + track.filePath.replace(/\\/g, '/').replace(/^\//, '');

    trackEntries.push(
      `    <TRACK TrackID="${trackId}" Name="${escapeXml(track.title)}" Artist="${escapeXml(
        track.artist
      )}" Album="${escapeXml(track.album || '')}" TotalTime="${duration}" AverageBpm="${bpm}" Tonality="${escapeXml(
        tonality
      )}" Size="${size}" BitRate="${bitrate}" Location="${escapeXml(fileUrl)}"/>`
    );

    playlistTracks.push(`        <TRACK Key="${trackId}"/>`);
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="webdeejaytools" Version="1.0.0" Company="AlienMind"/>
  <COLLECTION Entries="${tracks.length}">
${trackEntries.join('\n')}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="${escapeXml(options.playlistName || 'DJ Set')}" Type="1" KeyType="0" Entries="${tracks.length}">
${playlistTracks.join('\n')}
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>`;
}

/**
 * Generate human-readable tracklist text or CSV
 */
export function generateTextTracklist(
  tracks: LocalTrackItem[],
  options: PlaylistExportOptions
): string {
  if (options.format === 'csv') {
    const headers = ['#', 'Artist', 'Title', 'Album', 'BPM', 'Key', 'Camelot', 'Duration', 'Path'];
    const rows = tracks.map((t, idx) => {
      const camelot = parseKeyToCamelot(t.key);
      const mins = Math.floor((t.durationSec || 0) / 60);
      const secs = Math.round((t.durationSec || 0) % 60);
      const time = `${mins}:${secs.toString().padStart(2, '0')}`;
      return [
        idx + 1,
        `"${t.artist.replace(/"/g, '""')}"`,
        `"${t.title.replace(/"/g, '""')}"`,
        `"${(t.album || '').replace(/"/g, '""')}"`,
        t.bpm || '',
        `"${t.key || ''}"`,
        camelot ? formatCamelotKey(camelot) : '',
        time,
        `"${t.filePath.replace(/"/g, '""')}"`,
      ].join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  }

  // Plain Text formatted tracklist for DJ sets / 1001Tracklists / Mixcloud
  const lines: string[] = [];
  if (options.playlistName) {
    lines.push(`=== ${options.playlistName} ===`);
    lines.push(`Total Tracks: ${tracks.length}`);
    lines.push('');
  }

  tracks.forEach((t, idx) => {
    const num = (idx + 1).toString().padStart(2, '0');
    const camelot = parseKeyToCamelot(t.key);
    const tags: string[] = [];
    if (t.bpm) tags.push(`${t.bpm} BPM`);
    if (camelot) tags.push(formatCamelotKey(camelot));
    else if (t.key) tags.push(t.key);

    const tagStr = tags.length > 0 ? ` [${tags.join(' | ')}]` : '';
    lines.push(`${num}. ${t.artist} - ${t.title}${tagStr}`);
  });

  return lines.join('\n');
}

/**
 * Main export function
 */
export function exportPlaylist(
  tracks: LocalTrackItem[],
  options: PlaylistExportOptions
): { content: string; mimeType: string; filename: string } {
  const safeName = (options.playlistName || 'dj_set').trim().replace(/[^a-zA-Z0-9_-]/g, '_');

  switch (options.format) {
    case 'm3u8':
      return {
        content: generateM3uPlaylist(tracks, options),
        mimeType: 'application/vnd.apple.mpegurl;charset=utf-8',
        filename: `${safeName}.m3u8`,
      };
    case 'm3u':
      return {
        content: generateM3uPlaylist(tracks, options),
        mimeType: 'audio/x-mpegurl;charset=utf-8',
        filename: `${safeName}.m3u`,
      };
    case 'rekordbox_xml':
      return {
        content: generateRekordboxXml(tracks, options),
        mimeType: 'application/xml;charset=utf-8',
        filename: `${safeName}_rekordbox.xml`,
      };
    case 'csv':
      return {
        content: generateTextTracklist(tracks, options),
        mimeType: 'text/csv;charset=utf-8',
        filename: `${safeName}.csv`,
      };
    case 'txt':
      return {
        content: generateTextTracklist(tracks, options),
        mimeType: 'text/plain;charset=utf-8',
        filename: `${safeName}_tracklist.txt`,
      };
    case 'json':
      return {
        content: JSON.stringify(
          {
            playlistName: options.playlistName,
            createdAt: new Date().toISOString(),
            trackCount: tracks.length,
            tracks: tracks.map((t, idx) => ({
              position: idx + 1,
              ...t,
              camelotKey: parseKeyToCamelot(t.key),
            })),
          },
          null,
          2
        ),
        mimeType: 'application/json;charset=utf-8',
        filename: `${safeName}.json`,
      };
    default:
      return {
        content: generateM3uPlaylist(tracks, options),
        mimeType: 'application/vnd.apple.mpegurl;charset=utf-8',
        filename: `${safeName}.m3u8`,
      };
  }
}

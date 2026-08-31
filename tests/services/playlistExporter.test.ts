import { describe, it, expect } from 'vitest';
import {
  generateM3uPlaylist,
  generateRekordboxXml,
  generateTextTracklist,
  exportPlaylist,
} from '../../src/shared/playlistExporter.js';
import { LocalTrackItem } from '../../src/shared/types.js';

const mockTracks: LocalTrackItem[] = [
  {
    id: 't1',
    fileName: '01_track1.mp3',
    filePath: 'C:/Music/01_track1.mp3',
    relativeSubPath: '01_track1.mp3',
    fileSize: 10000000,
    extension: '.mp3',
    title: 'Sunrise In Ibiza',
    artist: 'DJ Solaris',
    album: 'Summer Anthems',
    bpm: 126,
    key: '8A',
    durationSec: 360,
    lossless: false,
    bitrate: 320,
    hasArtwork: true,
  },
  {
    id: 't2',
    fileName: '02_track2.flac',
    filePath: 'C:/Music/Subfolder/02_track2.flac',
    relativeSubPath: 'Subfolder/02_track2.flac',
    fileSize: 35000000,
    extension: '.flac',
    title: 'Deep Ocean',
    artist: 'Luna & Tide',
    album: 'Deep Waves',
    bpm: 128,
    key: '8B',
    durationSec: 420,
    lossless: true,
    hasArtwork: false,
  },
];

describe('Playlist Exporter', () => {
  it('generates extended M3U8 with relative paths', () => {
    const m3u = generateM3uPlaylist(mockTracks, {
      playlistName: 'Club Set 2026',
      format: 'm3u8',
      useRelativePaths: true,
      includeHarmonicInfoInTitle: true,
    });

    expect(m3u).toContain('#EXTM3U');
    expect(m3u).toContain('#PLAYLIST:Club Set 2026');
    expect(m3u).toContain('#EXTINF:360,DJ Solaris - Sunrise In Ibiza [8A | 126 BPM]');
    expect(m3u).toContain('01_track1.mp3');
    expect(m3u).toContain('#EXTINF:420,Luna & Tide - Deep Ocean [8B | 128 BPM]');
    expect(m3u).toContain('Subfolder/02_track2.flac');
  });

  it('generates extended M3U with absolute paths', () => {
    const m3u = generateM3uPlaylist(mockTracks, {
      playlistName: 'Absolute Set',
      format: 'm3u',
      useRelativePaths: false,
    });

    expect(m3u).toContain('C:/Music/01_track1.mp3');
    expect(m3u).toContain('C:/Music/Subfolder/02_track2.flac');
  });

  it('generates valid Pioneer Rekordbox XML', () => {
    const xml = generateRekordboxXml(mockTracks, {
      playlistName: 'Main Stage',
      format: 'rekordbox_xml',
      useRelativePaths: false,
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<DJ_PLAYLISTS Version="1.0.0">');
    expect(xml).toContain('Name="Sunrise In Ibiza"');
    expect(xml).toContain('Tonality="8A"');
    expect(xml).toContain('AverageBpm="126.00"');
    expect(xml).toContain('<NODE Name="Main Stage" Type="1"');
    expect(xml).toContain('<TRACK Key="1"/>');
    expect(xml).toContain('<TRACK Key="2"/>');
  });

  it('generates CSV and plain text tracklists', () => {
    const csv = generateTextTracklist(mockTracks, {
      playlistName: 'Tracklist',
      format: 'csv',
      useRelativePaths: false,
    });
    expect(csv).toContain('DJ Solaris');
    expect(csv).toContain('Luna & Tide');

    const txt = generateTextTracklist(mockTracks, {
      playlistName: 'Tracklist',
      format: 'txt',
      useRelativePaths: false,
    });
    expect(txt).toContain('01. DJ Solaris - Sunrise In Ibiza [126 BPM | 8A]');
    expect(txt).toContain('02. Luna & Tide - Deep Ocean [128 BPM | 8B]');
  });

  it('exportPlaylist returns correct mimeType and filename', () => {
    const resM3u8 = exportPlaylist(mockTracks, {
      playlistName: 'Ibiza 2026',
      format: 'm3u8',
      useRelativePaths: true,
    });
    expect(resM3u8.filename).toBe('Ibiza_2026.m3u8');
    expect(resM3u8.mimeType).toContain('mpegurl');

    const resXml = exportPlaylist(mockTracks, {
      playlistName: 'Ibiza 2026',
      format: 'rekordbox_xml',
      useRelativePaths: false,
    });
    expect(resXml.filename).toBe('Ibiza_2026_rekordbox.xml');
    expect(resXml.mimeType).toContain('xml');
  });
});

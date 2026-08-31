import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { scanLocalDirectory } from '../../src/server/services/mp3/scanner.js';
import { createDjSet, deleteTracks } from '../../src/server/services/mp3/djset.js';

describe('MP3 Management Services', () => {
  const testBaseDir = path.resolve(process.cwd(), 'data', 'test_mp3_library');
  const testDownloadsDir = path.join(testBaseDir, 'downloads');
  const testLibraryDir = path.join(testBaseDir, 'library');

  beforeEach(async () => {
    if (fs.existsSync(testBaseDir)) {
      await fs.promises.rm(testBaseDir, { recursive: true, force: true });
    }
    await fs.promises.mkdir(testDownloadsDir, { recursive: true });
    await fs.promises.mkdir(testLibraryDir, { recursive: true });
  });

  afterEach(async () => {
    if (fs.existsSync(testBaseDir)) {
      await fs.promises.rm(testBaseDir, { recursive: true, force: true });
    }
  });

  it('should scan directories recursively and extract file metadata', async () => {
    // Create nested subfolder structure: Artist - Album/01 - Track.mp3
    const albumFolder1 = path.join(testDownloadsDir, 'Daft Punk - Discovery (2001)');
    const albumFolder2 = path.join(testDownloadsDir, 'Justice - Cross (2007)');
    await fs.promises.mkdir(albumFolder1, { recursive: true });
    await fs.promises.mkdir(albumFolder2, { recursive: true });

    await fs.promises.writeFile(path.join(albumFolder1, '01 - One More Time.mp3'), Buffer.from('mock mp3 data 1'));
    await fs.promises.writeFile(path.join(albumFolder1, '02 - Aerodynamic.flac'), Buffer.from('mock flac data 2'));
    await fs.promises.writeFile(path.join(albumFolder2, '03 - Genesis.mp3'), Buffer.from('mock mp3 data 3'));
    // Non-audio file should be ignored
    await fs.promises.writeFile(path.join(albumFolder1, 'cover.jpg'), Buffer.from('mock image'));

    const result = await scanLocalDirectory(testDownloadsDir);

    expect(result.totalFiles).toBe(3);
    expect(result.tracks.length).toBe(3);

    const track1 = result.tracks.find((t) => t.fileName.includes('One More Time'));
    expect(track1).toBeDefined();
    expect(track1?.extension).toBe('.mp3');
    expect(track1?.title).toBe('One More Time');
    expect(track1?.artist).toBe('Daft Punk');
    expect(track1?.album).toBe('Discovery (2001)');
  });

  it('should create flattened DJ set in copy mode (non-destructive)', async () => {
    const subfolder = path.join(testDownloadsDir, 'ArtistA - AlbumA');
    await fs.promises.mkdir(subfolder, { recursive: true });
    const file1 = path.join(subfolder, '01 - Track 1.mp3');
    const file2 = path.join(subfolder, '02 - Track 2.mp3');
    await fs.promises.writeFile(file1, 'data 1');
    await fs.promises.writeFile(file2, 'data 2');

    const targetSetDir = path.join(testLibraryDir, 'Summer_Festival_2026');

    const result = await createDjSet({
      sourceDirectory: testDownloadsDir,
      targetDirectory: targetSetDir,
      sessionName: 'Summer_Festival_2026',
      trackPaths: [file1, file2],
      copyMode: true,
    });

    expect(result.success).toBe(true);
    expect(result.processedCount).toBe(2);
    expect(result.copyMode).toBe(true);

    // Verify files copied to target
    expect(fs.existsSync(path.join(targetSetDir, '01 - Track 1.mp3'))).toBe(true);
    expect(fs.existsSync(path.join(targetSetDir, '02 - Track 2.mp3'))).toBe(true);

    // Verify source files still exist (copy mode)
    expect(fs.existsSync(file1)).toBe(true);
    expect(fs.existsSync(file2)).toBe(true);
  });

  it('should create flattened DJ set in move mode (default) and clean empty source folders', async () => {
    const subfolder1 = path.join(testDownloadsDir, 'ArtistA - AlbumA');
    const subfolder2 = path.join(testDownloadsDir, 'ArtistB - AlbumB');
    await fs.promises.mkdir(subfolder1, { recursive: true });
    await fs.promises.mkdir(subfolder2, { recursive: true });

    const file1 = path.join(subfolder1, '01 - Track 1.mp3');
    const file2 = path.join(subfolder2, '01 - Track 1.mp3'); // Same filename to test collision avoidance!
    await fs.promises.writeFile(file1, 'data from A');
    await fs.promises.writeFile(file2, 'data from B');

    const targetSetDir = path.join(testLibraryDir, 'Club_Night');

    const result = await createDjSet({
      sourceDirectory: testDownloadsDir,
      targetDirectory: targetSetDir,
      sessionName: 'Club_Night',
      trackPaths: [file1, file2],
      copyMode: false, // move mode (default)
      cleanEmptyFolders: true,
    });

    expect(result.success).toBe(true);
    expect(result.processedCount).toBe(2);
    expect(result.copyMode).toBe(false);

    // Verify both files moved to flattened target with collision resolved
    const targetFiles = await fs.promises.readdir(targetSetDir);
    expect(targetFiles.length).toBe(2);
    expect(targetFiles).toContain('01 - Track 1.mp3');
    expect(targetFiles).toContain('01 - Track 1 (1).mp3');

    // Source files should no longer exist
    expect(fs.existsSync(file1)).toBe(false);
    expect(fs.existsSync(file2)).toBe(false);

    // Empty subfolders should have been cleaned up
    expect(fs.existsSync(subfolder1)).toBe(false);
    expect(fs.existsSync(subfolder2)).toBe(false);
  });

  it('should permanently delete files from disk and clean empty directories', async () => {
    const subfolder = path.join(testDownloadsDir, 'ArtistToDelete - AlbumToDelete');
    await fs.promises.mkdir(subfolder, { recursive: true });
    const file1 = path.join(subfolder, '01 - TrackToDelete.mp3');
    const file2 = path.join(subfolder, '02 - TrackToDelete2.mp3');
    await fs.promises.writeFile(file1, 'data to delete 1');
    await fs.promises.writeFile(file2, 'data to delete 2');

    expect(fs.existsSync(file1)).toBe(true);
    expect(fs.existsSync(file2)).toBe(true);

    const result = await deleteTracks([file1, file2], testDownloadsDir);

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(2);
    expect(fs.existsSync(file1)).toBe(false);
    expect(fs.existsSync(file2)).toBe(false);
    expect(fs.existsSync(subfolder)).toBe(false); // Cleaned empty folder
  });
});

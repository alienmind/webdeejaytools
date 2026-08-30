import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import sanitize from 'sanitize-filename';
import { DownloadItemProgress, QualityId, TrackItem } from '../../../shared/types.js';
import { QobuzClient } from '../qobuz/client.js';
import { tagAudioFile } from './tagger.js';
import { generateM3uPlaylist, M3uEntry } from './m3u.js';
import { store } from '../../db/store.js';

export interface EnqueueOptions {
  tracks: TrackItem[];
  quality?: QualityId;
  downloadDir?: string;
  playlistTitle?: string;
  createM3u?: boolean;
}

export class DownloadQueue extends EventEmitter {
  private queue: DownloadItemProgress[] = [];
  private activeDownloads = 0;
  private maxConcurrency = 3;
  private completedEntriesByPlaylist: Map<string, M3uEntry[]> = new Map();

  public getQueue(): DownloadItemProgress[] {
    return [...this.queue];
  }

  public clearCompleted(): void {
    this.queue = this.queue.filter((item) => item.status !== 'completed' && item.status !== 'failed');
    this.emit('update', this.getQueue());
  }

  public enqueue(options: EnqueueOptions): DownloadItemProgress[] {
    const settings = store.getSettings();
    const newItems: DownloadItemProgress[] = options.tracks.map((track) => ({
      id: `dl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      track,
      status: 'queued',
      progressPercent: 0,
    }));

    this.queue.push(...newItems);
    this.emit('update', this.getQueue());

    // Process next items
    this.processQueue(options.quality || settings.defaultQuality, options.downloadDir || settings.defaultDownloadDir, options.playlistTitle, options.createM3u ?? settings.createM3u);

    return newItems;
  }

  private async processQueue(
    quality: QualityId,
    downloadDir: string,
    playlistTitle?: string,
    createM3u = true
  ): Promise<void> {
    while (this.activeDownloads < this.maxConcurrency) {
      const nextItem = this.queue.find((item) => item.status === 'queued');
      if (!nextItem) break;

      this.activeDownloads++;
      nextItem.status = 'downloading';
      this.emit('update', this.getQueue());

      this.downloadTrack(nextItem, quality, downloadDir, playlistTitle, createM3u)
        .catch((err) => {
          console.error(`[DownloadQueue] Error downloading ${nextItem.track.title}:`, err);
          nextItem.status = 'failed';
          nextItem.error = err.message || 'Download failed';
          this.emit('update', this.getQueue());
        })
        .finally(() => {
          this.activeDownloads--;
          this.emit('update', this.getQueue());
          this.processQueue(quality, downloadDir, playlistTitle, createM3u);
        });
    }
  }

  private sanitizeName(name: string): string {
    return sanitize(name.replace(/[\/\\:*?"<>|]/g, '_')).trim() || 'Unknown';
  }

  private formatTemplate(
    template: string,
    track: TrackItem
  ): string {
    const artist = this.sanitizeName(track.artist || 'Unknown Artist');
    const album = this.sanitizeName(track.album || 'Unknown Album');
    const title = this.sanitizeName(track.title || 'Unknown Title');
    const year = track.year ? this.sanitizeName(track.year) : 'Unknown Year';
    const trackNumber = String(track.trackNumber || 1).padStart(2, '0');

    return template
      .replace(/{artist}/gi, artist)
      .replace(/{album}/gi, album)
      .replace(/{title}/gi, title)
      .replace(/{tracktitle}/gi, title)
      .replace(/{tracknumber}/gi, trackNumber)
      .replace(/{year}/gi, year);
  }

  private async downloadTrack(
    item: DownloadItemProgress,
    quality: QualityId,
    downloadDir: string,
    playlistTitle?: string,
    createM3u = true
  ): Promise<void> {
    const settings = store.getSettings();
    const qobuzAccount = store.getActiveAccount('qobuz');
    const userAuthToken = qobuzAccount?.credentials.qobuz?.userAuthToken;
    const appId = qobuzAccount?.credentials.qobuz?.appId;
    const secret = qobuzAccount?.credentials.qobuz?.secret;

    const qobuzClient = new QobuzClient(appId, secret);

    // Resolve streaming URL
    const streamInfo = await qobuzClient.getFileUrl(item.track.id, quality, userAuthToken);
    if (!streamInfo.url) {
      throw new Error('No stream URL returned from Qobuz API');
    }

    const extension = quality === 5 ? 'mp3' : 'flac';
    const folderName = this.formatTemplate(settings.folderFormat, item.track);
    const fileName = `${this.formatTemplate(settings.trackFormat, item.track)}.${extension}`;
    const targetFolder = path.resolve(downloadDir, folderName);
    const targetFilePath = path.resolve(targetFolder, fileName);

    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    item.targetPath = targetFilePath;
    this.emit('update', this.getQueue());

    // Stream download
    const response = await fetch(streamInfo.url);
    if (!response.ok || !response.body) {
      throw new Error(`Stream fetch failed: ${response.statusText}`);
    }

    const contentLength = Number(response.headers.get('content-length')) || 0;
    let downloadedBytes = 0;
    const startTime = Date.now();

    const fileStream = fs.createWriteStream(targetFilePath);

    // Read stream chunks
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      downloadedBytes += value.length;
      fileStream.write(Buffer.from(value));

      const elapsedSec = (Date.now() - startTime) / 1000;
      if (contentLength > 0) {
        item.progressPercent = Math.min(100, Math.round((downloadedBytes / contentLength) * 100));
      }
      if (elapsedSec > 0) {
        item.speedBps = Math.round(downloadedBytes / elapsedSec);
      }

      this.emit('update', this.getQueue());
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.end(() => resolve());
      fileStream.on('error', reject);
    });

    // Tag file
    item.status = 'tagging';
    this.emit('update', this.getQueue());

    await tagAudioFile(targetFilePath, item.track, {
      embedArtwork: settings.embedArtwork,
    });

    item.status = 'completed';
    item.progressPercent = 100;
    this.emit('update', this.getQueue());

    // Handle M3U playlist generation
    if (createM3u) {
      const plKey = playlistTitle || item.track.album || 'Playlist';
      if (!this.completedEntriesByPlaylist.has(plKey)) {
        this.completedEntriesByPlaylist.set(plKey, []);
      }
      this.completedEntriesByPlaylist.get(plKey)?.push({
        track: item.track,
        filePath: targetFilePath,
      });

      const m3uPath = path.resolve(targetFolder, `${this.sanitizeName(plKey)}.m3u`);
      const entries = this.completedEntriesByPlaylist.get(plKey) || [];
      generateM3uPlaylist(m3uPath, plKey, entries);
    }
  }
}

export const downloadQueue = new DownloadQueue();

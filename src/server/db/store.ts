import fs from 'fs';
import os from 'os';
import path from 'path';
import { Account, AppSettings, QualityId, DjSetItem } from '../../shared/types.js';

/**
 * Windows and macOS have case-insensitive filesystems; Linux does not. Folding case
 * unconditionally would treat Track.flac and track.flac as one file on Linux, where they are two.
 */
const CASE_INSENSITIVE_FS = process.platform === 'win32' || process.platform === 'darwin';

function pathKey(p: string): string {
  const resolved = path.resolve(p);
  return CASE_INSENSITIVE_FS ? resolved.toLowerCase() : resolved;
}

function isUnderTemp(candidate: string | undefined): boolean {
  if (!candidate) return false;
  const rel = path.relative(path.resolve(os.tmpdir()), path.resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

interface DatabaseSchema {
  accounts: Account[];
  settings: AppSettings;
  conversionHistory: any[];
  downloadHistory: any[];
  djSets?: DjSetItem[];
}

export function getBaseAppDir(): string {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }
  if (process.env.APP_BASE_DIR) {
    return process.env.APP_BASE_DIR;
  }
  return process.cwd();
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultDownloadDir: path.resolve(getBaseAppDir(), 'downloads'),
  defaultLibraryDir: path.resolve(getBaseAppDir(), 'library'),
  defaultQuality: 6 as QualityId, // FLAC 16/44.1
  embedArtwork: true,
  createM3u: true,
  folderFormat: '{artist} - {album} ({year})',
  trackFormat: '{trackNumber} - {title}',
  djMode: true,
};

const DEFAULT_DB: DatabaseSchema = {
  accounts: [],
  settings: DEFAULT_SETTINGS,
  conversionHistory: [],
  downloadHistory: [],
};

export class JsonStore {
  private dbPath: string;
  private data: DatabaseSchema;
  private batchDepth = 0;
  private batchDirty = false;

  constructor(customPath?: string) {
    this.dbPath = customPath || path.resolve(getBaseAppDir(), 'data', 'db.json');
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (!fs.existsSync(this.dbPath)) {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        this.saveData(DEFAULT_DB);
        return JSON.parse(JSON.stringify(DEFAULT_DB));
      }

      const content = fs.readFileSync(this.dbPath, 'utf-8');
      const parsed = JSON.parse(content);
      const settings = {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings || {}),
      };

      // Ensure defaultLibraryDir is initialized if not present in legacy db
      if (!settings.defaultLibraryDir) {
        settings.defaultLibraryDir = path.resolve(getBaseAppDir(), 'library');
      }

      // A previous portable run may have persisted an unpacked-temp path. Detect it against the
      // real OS temp directory rather than a hardcoded Windows string, so it works everywhere.
      if (isUnderTemp(settings.defaultDownloadDir)) {
        settings.defaultDownloadDir = path.resolve(getBaseAppDir(), 'downloads');
      }
      if (isUnderTemp(settings.defaultLibraryDir)) {
        settings.defaultLibraryDir = path.resolve(getBaseAppDir(), 'library');
      }

      return {
        ...DEFAULT_DB,
        ...parsed,
        settings,
      };
    } catch (err) {
      console.error('[Store] Error reading database, using defaults:', err);
      return JSON.parse(JSON.stringify(DEFAULT_DB));
    }
  }

  /**
   * Writes the database via write-temp-then-rename.
   *
   * rename() over an existing file is atomic on POSIX and succeeds on Windows, so the previous
   * unlink-then-rename was not just unnecessary - it opened a window in which db.json did not
   * exist at all, and a crash there lost every stored account. Windows can still transiently
   * refuse the rename while an antivirus or indexer holds the file, which is what the retry is
   * for; the temp file is only removed once the swap has actually happened.
   */
  private saveData(data: DatabaseSchema): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const serialized = JSON.stringify(data, null, 2);
    const tempPath = `${this.dbPath}.tmp`;
    fs.writeFileSync(tempPath, serialized, 'utf-8');

    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.renameSync(tempPath, this.dbPath);
        return;
      } catch (err: any) {
        lastErr = err;
        if (err?.code !== 'EPERM' && err?.code !== 'EBUSY' && err?.code !== 'EACCES') break;
        // Busy-wait briefly; this path is rare and the store is synchronous by design.
        const until = Date.now() + 30 * (attempt + 1);
        while (Date.now() < until) {
          /* spin */
        }
      }
    }

    // Last resort: copy over the target and keep the temp file until the copy has landed.
    try {
      fs.copyFileSync(tempPath, this.dbPath);
      fs.unlinkSync(tempPath);
    } catch {
      console.error('[Store] Could not replace database file:', lastErr);
      throw lastErr instanceof Error ? lastErr : new Error('Failed to persist database');
    }
  }

  private persist(): void {
    if (this.batchDepth > 0) {
      this.batchDirty = true;
      return;
    }
    this.saveData(this.data);
  }

  /**
   * Coalesces the writes inside `fn` into a single persist.
   *
   * listDjSets() previously called addOrUpdateDjSet once per discovered folder, so an O(n) scan
   * performed O(n) full-file rewrites of the entire database.
   */
  public batch<T>(fn: () => T): T {
    this.batchDepth++;
    try {
      return fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.batchDirty) {
        this.batchDirty = false;
        this.saveData(this.data);
      }
    }
  }

  // --- Accounts ---

  public getAccounts(): Account[] {
    return [...this.data.accounts];
  }

  public getAccount(id: string): Account | undefined {
    return this.data.accounts.find((a) => a.id === id);
  }

  public getActiveAccount(service: 'qobuz' | 'spotify'): Account | undefined {
    return this.data.accounts.find((a) => a.service === service && a.isActive);
  }

  public saveAccount(account: Partial<Account> & { service: 'qobuz' | 'spotify'; label: string }): Account {
    const now = new Date().toISOString();
    const existingIndex = account.id ? this.data.accounts.findIndex((a) => a.id === account.id) : -1;

    if (existingIndex >= 0) {
      const updated: Account = {
        ...this.data.accounts[existingIndex],
        ...account,
        updatedAt: now,
      };
      this.data.accounts[existingIndex] = updated;
      this.persist();
      return updated;
    }

    const newAccount: Account = {
      id: account.id || `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      service: account.service,
      label: account.label,
      email: account.email,
      username: account.username,
      avatarUrl: account.avatarUrl,
      isActive: account.isActive ?? (this.data.accounts.filter((a) => a.service === account.service).length === 0),
      credentials: account.credentials || {},
      createdAt: now,
      updatedAt: now,
    };

    if (newAccount.isActive) {
      // Deactivate other accounts of same service
      for (const a of this.data.accounts) {
        if (a.service === newAccount.service) {
          a.isActive = false;
        }
      }
    }

    this.data.accounts.push(newAccount);
    this.persist();
    return newAccount;
  }

  public deleteAccount(id: string): boolean {
    const initialLen = this.data.accounts.length;
    const removed = this.data.accounts.find((a) => a.id === id);
    this.data.accounts = this.data.accounts.filter((a) => a.id !== id);

    if (removed && removed.isActive) {
      // Make another account active if available
      const nextActive = this.data.accounts.find((a) => a.service === removed.service);
      if (nextActive) {
        nextActive.isActive = true;
      }
    }

    this.persist();
    return this.data.accounts.length < initialLen;
  }

  public setActiveAccount(id: string): Account | undefined {
    const target = this.data.accounts.find((a) => a.id === id);
    if (!target) return undefined;

    for (const a of this.data.accounts) {
      if (a.service === target.service) {
        a.isActive = a.id === id;
      }
    }
    this.persist();
    return target;
  }

  // --- Settings ---

  public getSettings(): AppSettings {
    return { ...this.data.settings };
  }

  public updateSettings(settings: Partial<AppSettings>): AppSettings {
    this.data.settings = {
      ...this.data.settings,
      ...settings,
    };
    this.persist();
    return { ...this.data.settings };
  }

  // --- DJ Sets ---

  public getDjSets(): DjSetItem[] {
    return [...(this.data.djSets || [])];
  }

  public addOrUpdateDjSet(set: { name: string; path: string; trackCount: number }): DjSetItem {
    if (!this.data.djSets) {
      this.data.djSets = [];
    }

    const resolvedPath = path.resolve(set.path);
    const existingIdx = this.data.djSets.findIndex((s) => pathKey(s.path) === pathKey(resolvedPath));

    const item: DjSetItem = {
      id: existingIdx !== -1 ? this.data.djSets[existingIdx].id : `djset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: set.name,
      path: resolvedPath,
      trackCount: set.trackCount,
      createdAt: existingIdx !== -1 ? this.data.djSets[existingIdx].createdAt : new Date().toISOString(),
    };

    if (existingIdx !== -1) {
      this.data.djSets[existingIdx] = item;
    } else {
      this.data.djSets.unshift(item);
    }

    this.persist();
    return item;
  }

  public deleteDjSet(pathOrId: string): boolean {
    if (!this.data.djSets) return false;
    const initialLen = this.data.djSets.length;
    const resolved = pathKey(pathOrId);
    this.data.djSets = this.data.djSets.filter((s) => s.id !== pathOrId && pathKey(s.path) !== resolved);
    this.persist();
    return this.data.djSets.length < initialLen;
  }
}

export const store = new JsonStore();

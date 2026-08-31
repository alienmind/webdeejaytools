import fs from 'fs';
import path from 'path';
import { Account, AppSettings, QualityId } from '../../shared/types.js';

interface DatabaseSchema {
  accounts: Account[];
  settings: AppSettings;
  conversionHistory: any[];
  downloadHistory: any[];
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

      // If previous portable run saved a temp AppData path, sanitize back to portable USB directory
      if (settings.defaultDownloadDir && settings.defaultDownloadDir.includes('AppData\\Local\\Temp')) {
        settings.defaultDownloadDir = path.resolve(getBaseAppDir(), 'downloads');
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

  private saveData(data: DatabaseSchema): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${this.dbPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, this.dbPath);
  }

  private persist(): void {
    this.saveData(this.data);
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
}

export const store = new JsonStore();

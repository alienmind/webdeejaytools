import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { JsonStore } from '../../src/server/db/store.js';

describe('JsonStore', () => {
  const testDbPath = path.resolve(process.cwd(), 'data', 'test_db.json');
  let store: JsonStore;

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    store = new JsonStore(testDbPath);
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should initialize with default settings and empty accounts', () => {
    const accounts = store.getAccounts();
    const settings = store.getSettings();

    expect(accounts).toEqual([]);
    expect(settings.defaultQuality).toBe(6);
    expect(settings.embedArtwork).toBe(true);
  });

  it('should save, retrieve, activate, and delete accounts', () => {
    const acc1 = store.saveAccount({
      service: 'qobuz',
      label: 'Main Qobuz',
      credentials: { qobuz: { email: 'test@qobuz.com' } },
    });

    expect(acc1.id).toBeDefined();
    expect(acc1.isActive).toBe(true);

    const acc2 = store.saveAccount({
      service: 'qobuz',
      label: 'Second Qobuz',
      credentials: { qobuz: { email: 'dj@qobuz.com' } },
    });

    expect(acc2.isActive).toBe(false);

    // Activate second account
    store.setActiveAccount(acc2.id);
    expect(store.getAccount(acc2.id)?.isActive).toBe(true);
    expect(store.getAccount(acc1.id)?.isActive).toBe(false);

    // Delete account
    const deleted = store.deleteAccount(acc1.id);
    expect(deleted).toBe(true);
    expect(store.getAccounts().length).toBe(1);
  });

  it('should update settings', () => {
    const updated = store.updateSettings({
      defaultQuality: 27,
      createM3u: false,
    });

    expect(updated.defaultQuality).toBe(27);
    expect(updated.createM3u).toBe(false);
    expect(store.getSettings().defaultQuality).toBe(27);
  });
});

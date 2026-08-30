import { describe, it, expect } from 'vitest';
import { generateRequestSignature } from '../../src/server/services/qobuz/signer.js';
import { QobuzClient } from '../../src/server/services/qobuz/client.js';

describe('Qobuz Signer', () => {
  it('should generate valid MD5 signature for track/getFileUrl', () => {
    const params = {
      format_id: 6,
      intent: 'stream',
      track_id: '123456',
    };
    const requestTs = '1700000000';
    const secret = 'testsecret123';
    const sig = generateRequestSignature('track/getFileUrl', params, requestTs, secret);

    expect(sig).toBeDefined();
    expect(sig).toHaveLength(32);
    expect(/^[a-f0-9]{32}$/.test(sig)).toBe(true);
  });
});

describe('Qobuz URL Parser', () => {
  const client = new QobuzClient();

  it('should parse play.qobuz.com track URLs', () => {
    const res = client.parseUrl('https://play.qobuz.com/track/12345678');
    expect(res).toEqual({ type: 'track', id: '12345678' });
  });

  it('should parse open.qobuz.com album URLs', () => {
    const res = client.parseUrl('https://open.qobuz.com/album/0001234567890');
    expect(res).toEqual({ type: 'album', id: '0001234567890' });
  });

  it('should parse play.qobuz.com playlist URLs', () => {
    const res = client.parseUrl('https://play.qobuz.com/playlist/998877');
    expect(res).toEqual({ type: 'playlist', id: '998877' });
  });

  it('should parse numeric track IDs directly', () => {
    const res = client.parseUrl('54321');
    expect(res).toEqual({ type: 'track', id: '54321' });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import app from '../../src/server/index.js';
import { clearSessionRoots, grantSessionRoot } from '../../src/server/util/paths.js';

/**
 * Route-level tests.
 *
 * Every containment and validation fix lives at this layer, and it previously had no coverage at
 * all - the suite only exercised pure functions. Hono's app.request() runs a real request through
 * the whole middleware and routing stack without binding a socket.
 */

const LOCAL_HEADERS = { host: '127.0.0.1:34567' };

function req(pathname: string, init: RequestInit = {}) {
  return app.request(pathname, {
    ...init,
    headers: { ...LOCAL_HEADERS, ...(init.headers as Record<string, string>) },
  });
}

describe('local server guard', () => {
  it('rejects a request whose Host header is not loopback (DNS rebinding)', async () => {
    const res = await app.request('/api/health', { headers: { host: 'evil.example.com' } });
    expect(res.status).toBe(403);
  });

  it('rejects a cross-origin request', async () => {
    const res = await req('/api/health', { headers: { origin: 'https://evil.example.com' } });
    expect(res.status).toBe(403);
  });

  it('accepts a same-origin loopback request', async () => {
    const res = await req('/api/health', { headers: { origin: 'http://127.0.0.1:34567' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
  });

  it('accepts a request with no Origin header at all', async () => {
    const res = await req('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('mp3 routes: filesystem containment', () => {
  const base = path.resolve(process.cwd(), 'data', 'test_routes');
  const library = path.join(base, 'library');
  const secrets = path.join(base, 'secrets');
  const secretFile = path.join(secrets, 'id_rsa');
  const trackFile = path.join(library, 'track.mp3');

  beforeEach(async () => {
    await fs.promises.mkdir(library, { recursive: true });
    await fs.promises.mkdir(secrets, { recursive: true });
    await fs.promises.writeFile(secretFile, 'PRIVATE KEY MATERIAL');
    await fs.promises.writeFile(trackFile, 'mock audio bytes');
    clearSessionRoots();
    grantSessionRoot(library);
  });

  afterEach(async () => {
    clearSessionRoots();
    if (fs.existsSync(base)) {
      await fs.promises.rm(base, { recursive: true, force: true });
    }
  });

  it('streams a file inside an allowed root', async () => {
    const res = await req(`/api/mp3/stream?path=${encodeURIComponent(trackFile)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
  });

  it('refuses to stream a file outside the allowed roots', async () => {
    const res = await req(`/api/mp3/stream?path=${encodeURIComponent(secretFile)}`);
    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).not.toContain('PRIVATE KEY MATERIAL');
  });

  it('refuses a traversal path that climbs out of an allowed root', async () => {
    const traversal = path.join(library, '..', 'secrets', 'id_rsa');
    const res = await req(`/api/mp3/stream?path=${encodeURIComponent(traversal)}`);
    expect(res.status).toBe(403);
  });

  it('refuses artwork extraction from outside the allowed roots', async () => {
    const res = await req(`/api/mp3/artwork?path=${encodeURIComponent(secretFile)}`);
    expect(res.status).toBe(403);
  });

  it('rejects a stream request with no path parameter', async () => {
    const res = await req('/api/mp3/stream');
    expect(res.status).toBe(400);
  });

  it('refuses to delete files outside the allowed roots, and leaves them on disk', async () => {
    const res = await req('/api/mp3/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filePaths: [secretFile] }),
    });

    expect(res.status).toBe(403);
    expect(fs.existsSync(secretFile)).toBe(true);
  });

  it('refuses to move files outside the allowed roots into a DJ set', async () => {
    const res = await req('/api/mp3/create-dj-set', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionName: 'Exfiltrate',
        trackPaths: [secretFile],
        targetDirectory: library,
        copyMode: true,
      }),
    });

    expect(res.status).toBe(403);
    expect(fs.existsSync(secretFile)).toBe(true);
  });

  it('refuses to analyse files outside the allowed roots', async () => {
    const res = await req('/api/mp3/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filePaths: [secretFile], writeTags: true }),
    });
    expect(res.status).toBe(403);
  });
});

describe('request validation', () => {
  it('rejects a delete request with no file paths', async () => {
    const res = await req('/api/mp3/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filePaths: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a settings update with a value of the wrong type', async () => {
    const res = await req('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ defaultQuality: 'lossless-please' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a DJ set request with an empty session name', async () => {
    const res = await req('/api/mp3/create-dj-set', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionName: '   ' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('accounts route redaction', () => {
  it('never returns credential values to the client', async () => {
    const res = await req('/api/accounts');
    expect(res.status).toBe(200);

    const body = await res.text();
    // Even with no accounts saved, the shape must not carry a `credentials` key.
    expect(body).not.toContain('"credentials"');
    expect(body).not.toContain('userAuthToken');
    expect(body).not.toContain('clientSecret');
  });
});

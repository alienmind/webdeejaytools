import { QobuzClient } from './client.js';

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

  return { token, user };
}

// Kept for backward compatibility if ever called
export async function loginQobuzAutomated(_email?: string, _password?: string, _interactive?: boolean): Promise<string> {
  throw new Error('Browser automation has been removed. Please use direct token input or Quick Importer.');
}

export async function readLocalBrowserSession(): Promise<{ token: string; user: any }> {
  throw new Error('Local browser auto-detection has been removed. Please copy your token or cURL from DevTools.');
}

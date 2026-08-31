import crypto from 'crypto';
import { MiddlewareHandler } from 'hono';

/**
 * Loopback-only request guard.
 *
 * The server holds full filesystem authority on a fixed, guessable port. Two things follow:
 *
 * 1. DNS rebinding. A page on attacker.example can be re-resolved to 127.0.0.1, at which point the
 *    browser treats our origin as same-origin and hands over everything. The defence is a Host
 *    header allow-list: rebinding cannot forge Host.
 * 2. Plain cross-origin requests. Simple GETs (an <img> or <audio> src) reach us with no preflight,
 *    so CORS never protects the read routes. An Origin allow-list closes that.
 */

const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** Per-launch token, handed to the UI and required on mutating routes. Not persisted. */
export const SESSION_TOKEN = crypto.randomBytes(24).toString('hex');

export const SESSION_TOKEN_HEADER = 'x-wdt-session';

function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  // IPv6 literals arrive bracketed: [::1]:34567
  if (hostHeader.startsWith('[')) {
    const close = hostHeader.indexOf(']');
    return close === -1 ? null : hostHeader.slice(0, close + 1);
  }
  return hostHeader.split(':')[0];
}

export interface LocalGuardOptions {
  /**
   * Require the per-launch session token on state-changing requests. Off by default because the
   * Vite dev server serves index.html itself and cannot inject the token; the Electron build turns
   * it on.
   */
  requireSessionToken?: boolean;
  /** Extra origins to accept, e.g. the Vite dev server origin. */
  extraOrigins?: string[];
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function localGuard(options: LocalGuardOptions = {}): MiddlewareHandler {
  const extraOrigins = new Set(options.extraOrigins ?? []);

  return async (c, next) => {
    const host = hostnameOf(c.req.header('host'));
    if (!host || !ALLOWED_HOSTNAMES.has(host)) {
      return c.json({ error: 'Forbidden: this server only accepts loopback requests.' }, 403);
    }

    const origin = c.req.header('origin');
    if (origin) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).hostname;
      } catch {
        originHost = null;
      }
      const originAllowed =
        extraOrigins.has(origin) || (originHost !== null && ALLOWED_HOSTNAMES.has(originHost));
      if (!originAllowed) {
        return c.json({ error: 'Forbidden: cross-origin requests are not accepted.' }, 403);
      }
    }

    if (options.requireSessionToken && !SAFE_METHODS.has(c.req.method)) {
      const provided = c.req.header(SESSION_TOKEN_HEADER);
      if (provided !== SESSION_TOKEN) {
        return c.json({ error: 'Forbidden: missing or invalid session token.' }, 403);
      }
    }

    // Never let a local API response be embedded or sniffed into something else.
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');

    await next();
  };
}

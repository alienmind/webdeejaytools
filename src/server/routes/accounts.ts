import { Hono } from 'hono';
import { store } from '../db/index.js';
import { serviceRegistry, importCookiesOrToken } from '../services/index.js';
import { AuthTestResult } from '../../shared/types.js';
import { importCookieSchema, saveAccountSchema, testAccountSchema } from '../../shared/schemas.js';
import { errorResponse, parseBody } from '../util/validate.js';
import { redactAccount, redactAccounts } from '../util/redact.js';

const app = new Hono();

/**
 * Accounts never leave the server with their secrets attached. The UI needs presence and a hint,
 * not the Qobuz user_auth_token itself - and the previous behaviour handed the whole credential
 * blob to the browser on every page load.
 */

// List all accounts
app.get('/', (c) => {
  return c.json(redactAccounts(store.getAccounts()));
});

// Save or create account
app.post('/', async (c) => {
  try {
    const body = await parseBody(c, saveAccountSchema);

    // An update that omits credentials must not wipe the ones already stored: the client cannot
    // send them back, because it never received them.
    if (body.id && !body.credentials) {
      const existing = store.getAccount(body.id);
      if (existing) {
        const saved = store.saveAccount({ ...body, credentials: existing.credentials });
        return c.json(redactAccount(saved));
      }
    }

    const saved = store.saveAccount(body as any);
    return c.json(redactAccount(saved));
  } catch (err) {
    return errorResponse(c, err, 'API accounts/save');
  }
});

// Delete account
app.delete('/:id', (c) => {
  const id = c.req.param('id');
  const success = store.deleteAccount(id);
  return c.json({ success });
});

// Set active account
app.post('/:id/activate', (c) => {
  const id = c.req.param('id');
  const account = store.setActiveAccount(id);
  if (!account) {
    return c.json({ error: 'Account not found' }, 404);
  }
  return c.json(redactAccount(account));
});

// Test connection using modular service registry
app.post('/test', async (c) => {
  try {
    const { service, credentials } = await parseBody(c, testAccountSchema);

    if (!serviceRegistry.has(service)) {
      return c.json(
        {
          success: false,
          service,
          message: `Service provider '${service}' is not supported.`,
        } as AuthTestResult,
        400
      );
    }

    // `{ accountId }` means "test what is already stored", so the secret never has to leave the
    // server and come back.
    let resolved: unknown = credentials;
    const accountId = (credentials as { accountId?: string }).accountId;
    if (accountId) {
      const account = store.getAccount(accountId);
      if (!account) {
        return c.json({ success: false, service, message: 'Account not found' } as AuthTestResult, 404);
      }
      resolved = account.credentials?.[service] ?? {};
    }

    const adapter = serviceRegistry.get(service);
    const result = await adapter.testConnection(resolved);
    return c.json(result);
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: err?.message || 'Connection test failed',
      },
      400
    );
  }
});

/**
 * Import a session from a Cookie header, cURL snippet, or raw token pasted out of DevTools.
 *
 * The Playwright-driven /qobuz/browser-login and SQLite /qobuz/auto-detect routes were removed:
 * their implementations had already been reduced to functions that only threw, and they kept three
 * heavyweight browser-automation packages in the dependency tree for code that could not run.
 */
app.post('/qobuz/import-cookie', async (c) => {
  try {
    const body = await parseBody(c, importCookieSchema);
    const { token, user } = await importCookiesOrToken(body.input);

    const account = store.saveAccount({
      id: body.id || undefined,
      service: 'qobuz',
      label: body.label || user.display_name || user.email || 'Qobuz (Chrome Session)',
      credentials: {
        qobuz: {
          userAuthToken: token,
        },
      },
      isActive: true,
    });

    return c.json({
      success: true,
      account: redactAccount(account),
      user: {
        display_name: user.display_name,
        email: user.email,
        subscription: user.subscription,
      },
      message: `Successfully imported Qobuz session as ${user.display_name || user.email} (${user.subscription || 'Active'})`,
    });
  } catch (err: any) {
    console.error('[Qobuz Import Cookie] Error:', err);
    return c.json({ error: err?.message || 'Failed to import session from cookie' }, 400);
  }
});

export default app;

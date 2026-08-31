import { Hono } from 'hono';
import { store } from '../db/index.js';
import { serviceRegistry, loginQobuzAutomated, importCookiesOrToken, readLocalBrowserSession } from '../services/index.js';
import { AuthTestResult, ServiceType } from '../../shared/types.js';

const app = new Hono();

// List all accounts
app.get('/', (c) => {
  const accounts = store.getAccounts();
  return c.json(accounts);
});

// Save or create account
app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const saved = store.saveAccount(body);
    return c.json(saved);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to save account' }, 400);
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
  return c.json(account);
});

// Test connection using modular service registry
app.post('/test', async (c) => {
  const body = await c.req.json() as { service: ServiceType; credentials: any };
  const { service, credentials } = body;

  try {
    if (!serviceRegistry.has(service)) {
      return c.json({
        success: false,
        service,
        message: `Service provider '${service}' is not supported.`,
      } as AuthTestResult, 400);
    }

    const adapter = serviceRegistry.get(service);
    const result = await adapter.testConnection(credentials);
    return c.json(result);
  } catch (err: any) {
    return c.json({
      success: false,
      service,
      message: err.message || 'Connection test failed',
    } as AuthTestResult, 400);
  }
});

// Playwright Browser Login for Qobuz (Headless automated fill or Interactive window)
app.post('/qobuz/browser-login', async (c) => {
  try {
    const body = await c.req.json() as {
      email?: string;
      password?: string;
      label?: string;
      interactive?: boolean;
    };

    const token = await loginQobuzAutomated(body.email, body.password, !!body.interactive);
    const qobuzAdapter = serviceRegistry.get('qobuz');
    const testRes = await qobuzAdapter.testConnection({ userAuthToken: token });

    if (!testRes.success) {
      return c.json({ error: testRes.message || 'Failed to validate captured token' }, 400);
    }

    const account = store.saveAccount({
      service: 'qobuz',
      label: body.label || testRes.details?.username || 'Qobuz Account',
      credentials: {
        qobuz: {
          userAuthToken: token,
        },
      },
      isActive: true,
    });

    return c.json({
      success: true,
      account,
      details: testRes.details,
      message: testRes.message,
    });
  } catch (err: any) {
    console.error('[Qobuz Browser Login] Error:', err);
    return c.json({ error: err.message || 'Browser login failed' }, 500);
  }
});

// Import session directly from Chrome cookie string / cURL header / JSON export
app.post('/qobuz/import-cookie', async (c) => {
  try {
    const body = await c.req.json() as { input: string; label?: string; id?: string };
    if (!body.input || !body.input.trim()) {
      return c.json({ error: 'Please paste your Cookie header, cURL, or token string.' }, 400);
    }

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
      account,
      user,
      message: `Successfully imported Qobuz session as ${user.display_name || user.email} (${user.subscription || 'Active'})`,
    });
  } catch (err: any) {
    console.error('[Qobuz Import Cookie] Error:', err);
    return c.json({ error: err.message || 'Failed to import session from cookie' }, 400);
  }
});

// Auto-detect local Chrome / Brave / Edge session from SQLite
app.post('/qobuz/auto-detect', async (c) => {
  try {
    const { token, user } = await readLocalBrowserSession();

    const account = store.saveAccount({
      service: 'qobuz',
      label: user.display_name || user.email || 'Qobuz (Local Browser)',
      credentials: {
        qobuz: {
          userAuthToken: token,
        },
      },
      isActive: true,
    });

    return c.json({
      success: true,
      account,
      user,
      message: `Detected and linked Qobuz session for ${user.display_name || user.email} (${user.subscription || 'Active'})`,
    });
  } catch (err: any) {
    return c.json({ error: err.message || 'Auto-detection failed' }, 400);
  }
});

export default app;

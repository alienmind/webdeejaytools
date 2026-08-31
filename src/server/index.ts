import { Hono } from 'hono';
import accountsRouter from './routes/accounts.js';
import settingsRouter from './routes/settings.js';
import converterRouter from './routes/converter.js';
import downloaderRouter from './routes/downloader.js';
import eventsRouter from './routes/events.js';
import mp3Router from './routes/mp3.js';
import { localGuard, SESSION_TOKEN } from './middleware/localGuard.js';

const app = new Hono();

/**
 * Loopback guard runs before every route.
 *
 * This server has full filesystem authority on a fixed port, so it must refuse anything that did
 * not come from the app itself: DNS-rebound requests (caught by the Host allow-list) and
 * cross-origin requests (caught by the Origin allow-list).
 *
 * The session-token requirement is opt-in via WDT_REQUIRE_SESSION_TOKEN because the Vite dev
 * server serves index.html itself and has no way to inject the token; the packaged Electron build
 * serves its own HTML and turns it on.
 */
app.use(
  '*',
  localGuard({
    requireSessionToken: process.env.WDT_REQUIRE_SESSION_TOKEN === '1',
    extraOrigins: process.env.WDT_EXTRA_ORIGIN ? [process.env.WDT_EXTRA_ORIGIN] : [],
  })
);

// Mount API routes
app.route('/api/accounts', accountsRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/convert', converterRouter);
app.route('/api/download', downloaderRouter);
app.route('/api/events', eventsRouter);
app.route('/api/mp3', mp3Router);

// Healthcheck
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', time: new Date().toISOString() });
});

export { SESSION_TOKEN };
export default app;

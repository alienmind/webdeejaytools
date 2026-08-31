import { Hono } from 'hono';
import accountsRouter from './routes/accounts.js';
import settingsRouter from './routes/settings.js';
import converterRouter from './routes/converter.js';
import downloaderRouter from './routes/downloader.js';
import eventsRouter from './routes/events.js';
import mp3Router from './routes/mp3.js';

const app = new Hono();

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

export default app;

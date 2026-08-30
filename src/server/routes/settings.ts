import { Hono } from 'hono';
import { store } from '../db/index.js';

const app = new Hono();

// Get settings
app.get('/', (c) => {
  return c.json(store.getSettings());
});

// Update settings
app.put('/', async (c) => {
  try {
    const body = await c.req.json();
    const updated = store.updateSettings(body);
    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to update settings' }, 400);
  }
});

export default app;

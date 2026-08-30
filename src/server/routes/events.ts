import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { downloadQueue } from '../services/index.js';

const app = new Hono();

app.get('/', (c) => {
  return streamSSE(c, async (stream) => {
    // Send initial queue state
    await stream.writeSSE({
      data: JSON.stringify({ type: 'download_queue_update', data: downloadQueue.getQueue() }),
      event: 'message',
    });

    const updateHandler = async (queueData: any) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'download_queue_update', data: queueData }),
          event: 'message',
        });
      } catch {
        // stream closed
      }
    };

    downloadQueue.on('update', updateHandler);

    stream.onAbort(() => {
      downloadQueue.off('update', updateHandler);
    });

    // Heartbeat loop
    while (!stream.aborted) {
      await stream.sleep(25000);
      try {
        await stream.writeSSE({
          data: 'heartbeat',
          event: 'ping',
        });
      } catch {
        break;
      }
    }
  });
});

export default app;

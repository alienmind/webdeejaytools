import { useEffect, useState } from 'react';
import { DownloadItemProgress } from '../../shared/types.js';

export function useSSE() {
  const [downloadQueue, setDownloadQueue] = useState<DownloadItemProgress[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    function connect() {
      eventSource = new EventSource('/api/events');

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'download_queue_update' && Array.isArray(parsed.data)) {
            setDownloadQueue(parsed.data);
          }
        } catch {
          // Heartbeats or unparsed messages
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        if (eventSource) {
          eventSource.close();
        }
        reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);

  return { downloadQueue, isConnected };
}

import { NotificationData } from '@dwellio/shared';
import { API_BASE_URL } from '../config/api';

const MAX_DEDUP_SIZE = 200;
const STALLED_TIMEOUT_MS = 45000; // 45s stalled stream detection
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 15000;

export interface StreamCallbacks {
  onNotification: (notification: NotificationData) => void;
  onReconnected?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Connect to the backend SSE stream using native fetch() with Authorization Bearer header.
 *
 * Requirements:
 * - Uses standard HTTP Bearer authentication in headers (never puts tokens in query strings).
 * - Chunk-boundary safe SSE parser supporting split network buffers.
 * - In-memory LRU deduplication Set (200 capacity) preventing duplicate alert rendering.
 * - Exponential backoff reconnection loop with jitter.
 * - Stalled stream watchdog (aborts and reconnects if idle > 45s).
 * - Clean teardown via AbortController on user logout or component unmount.
 */
export const connectNotificationStream = (
  token: string,
  callbacks: StreamCallbacks
): (() => void) => {
  if (!token) {
    return () => {};
  }

  let isAborted = false;
  let activeAbortController: AbortController | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let stalledTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;

  // Bounded deduplication cache
  const seenIds = new Set<string>();

  const trackSeenId = (id: string): boolean => {
    if (seenIds.has(id)) {
      return true; // Already processed
    }
    if (seenIds.size >= MAX_DEDUP_SIZE) {
      const first = seenIds.values().next().value;
      if (first) seenIds.delete(first);
    }
    seenIds.add(id);
    return false;
  };

  const resetStalledWatchdog = () => {
    if (stalledTimeout) clearTimeout(stalledTimeout);
    if (isAborted) return;

    stalledTimeout = setTimeout(() => {
      if (!isAborted) {
        // Stream stalled (no heartbeat / data for 45s); abort and reconnect
        activeAbortController?.abort();
      }
    }, STALLED_TIMEOUT_MS);
  };

  const scheduleReconnect = (wasConnected: boolean) => {
    if (isAborted) return;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);

    const delay = Math.min(
      MAX_RECONNECT_DELAY_MS,
      INITIAL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempt)
    ) + Math.floor(Math.random() * 500);

    reconnectAttempt++;

    reconnectTimeout = setTimeout(() => {
      if (!isAborted) {
        connect(wasConnected);
      }
    }, delay);
  };

  const connect = async (isReconnecting = false) => {
    if (isAborted) return;

    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;

    try {
      const streamUrl = `${API_BASE_URL}/notifications/stream`;
      const response = await fetch(streamUrl, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`SSE stream connection failed with HTTP ${response.status}`);
      }

      // Successful connection established
      reconnectAttempt = 0;
      resetStalledWatchdog();

      if (isReconnecting && callbacks.onReconnected) {
        callbacks.onReconnected();
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (!isAborted) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        resetStalledWatchdog();
        buffer += decoder.decode(value, { stream: true });

        // Split by SSE event boundary (\n\n or \r\n\r\n)
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() || ''; // Incomplete trailing part stays in buffer

        for (const rawMessage of parts) {
          const trimmed = rawMessage.trim();
          if (!trimmed) continue;

          // SSE Comment (e.g. :ping, :connected)
          if (trimmed.startsWith(':')) {
            continue;
          }

          let eventType = 'message';
          let eventData = '';
          const lines = trimmed.split(/\r?\n/);

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              eventData = line.slice(5).trim();
            }
          }

          if (eventType === 'notification' && eventData) {
            try {
              const notification: NotificationData = JSON.parse(eventData);
              if (notification && notification.id) {
                const isDuplicate = trackSeenId(notification.id);
                if (!isDuplicate) {
                  callbacks.onNotification(notification);
                }
              }
            } catch {
              // Ignore malformed JSON chunks gracefully without crashing stream
            }
          }
        }
      }

      // Stream closed gracefully or reached EOF
      if (!isAborted) {
        scheduleReconnect(true);
      }
    } catch (err: unknown) {
      if (isAborted) return;

      if (callbacks.onError && err instanceof Error && err.name !== 'AbortError') {
        callbacks.onError(err);
      }

      scheduleReconnect(true);
    }
  };

  // Initial connection
  connect(false);

  // Return clean teardown function
  return () => {
    isAborted = true;
    if (stalledTimeout) clearTimeout(stalledTimeout);
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (activeAbortController) {
      try {
        activeAbortController.abort();
      } catch {
        // ignore
      }
    }
  };
};

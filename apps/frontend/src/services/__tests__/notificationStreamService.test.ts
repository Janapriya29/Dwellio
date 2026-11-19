import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { connectNotificationStream } from '../notificationStreamService';
import { NotificationData } from '@dwellio/shared';

describe('notificationStreamService — Fetch-Based SSE Reader', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMockReadableStream = (chunks: string[]) => {
    let index = 0;
    const encoder = new TextEncoder();

    return new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index]));
          index++;
        } else {
          controller.close();
        }
      },
    });
  };

  it('sends Authorization: Bearer <token> in the headers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: createMockReadableStream([':connected\n\n']),
    } as any);

    const onNotification = vi.fn();
    const disconnect = connectNotificationStream('test-jwt-token-xyz', { onNotification });

    await vi.advanceTimersByTimeAsync(10);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/notifications/stream'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-jwt-token-xyz',
          Accept: 'text/event-stream',
        }),
      })
    );

    disconnect();
  });

  it('parses incoming SSE notification events and triggers callback', async () => {
    const sampleNotif: NotificationData = {
      id: 'notif-stream-1',
      recipientId: 'cust-1',
      type: 'BOOKING_ACCEPTED',
      title: 'Booking Accepted',
      message: 'Your painting service has been confirmed.',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    const sseChunk = `:connected\n\nid: notif-stream-1\nevent: notification\ndata: ${JSON.stringify(sampleNotif)}\n\n`;

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: createMockReadableStream([sseChunk]),
    } as any);

    const onNotification = vi.fn();
    const disconnect = connectNotificationStream('token-123', { onNotification });

    await vi.advanceTimersByTimeAsync(20);

    expect(onNotification).toHaveBeenCalledTimes(1);
    expect(onNotification).toHaveBeenCalledWith(expect.objectContaining({
      id: 'notif-stream-1',
      title: 'Booking Accepted',
    }));

    disconnect();
  });

  it('handles split chunks across network buffers safely', async () => {
    const part1 = `id: notif-split-2\nevent: notification\ndata: {"id":"notif-split-2","recipientId":"cust-1",`;
    const part2 = `"type":"BOOKING_REQUESTED","title":"New Request","message":"Plumbing visit requested.","isRead":false}\n\n`;

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: createMockReadableStream([part1, part2]),
    } as any);

    const onNotification = vi.fn();
    const disconnect = connectNotificationStream('token-123', { onNotification });

    await vi.advanceTimersByTimeAsync(30);

    expect(onNotification).toHaveBeenCalledTimes(1);
    expect(onNotification).toHaveBeenCalledWith(expect.objectContaining({
      id: 'notif-split-2',
      title: 'New Request',
    }));

    disconnect();
  });

  it('drops duplicate notifications with identical IDs', async () => {
    const notif: NotificationData = {
      id: 'notif-duplicate-3',
      recipientId: 'cust-1',
      type: 'BOOKING_COMPLETED',
      title: 'Completed',
      message: 'Work finished.',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    const duplicateChunks = [
      `event: notification\ndata: ${JSON.stringify(notif)}\n\n`,
      `event: notification\ndata: ${JSON.stringify(notif)}\n\n`, // identical
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: createMockReadableStream(duplicateChunks),
    } as any);

    const onNotification = vi.fn();
    const disconnect = connectNotificationStream('token-123', { onNotification });

    await vi.advanceTimersByTimeAsync(30);

    // Only invoked once due to bounded deduplication
    expect(onNotification).toHaveBeenCalledTimes(1);

    disconnect();
  });

  it('ignores heartbeat pings and malformed JSON without throwing', async () => {
    const mixedChunks = [
      ':ping\n\n',
      'event: notification\ndata: INVALID_JSON_DATA{{{\n\n',
      ':connected\n\n',
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: createMockReadableStream(mixedChunks),
    } as any);

    const onNotification = vi.fn();
    const disconnect = connectNotificationStream('token-123', { onNotification });

    await vi.advanceTimersByTimeAsync(30);

    expect(onNotification).not.toHaveBeenCalled();

    disconnect();
  });

  it('stops reconnection and cancels reader upon calling disconnect', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network offline'));

    const onNotification = vi.fn();
    const disconnect = connectNotificationStream('token-123', { onNotification });

    disconnect();

    expect(abortSpy).toHaveBeenCalled();
  });
});

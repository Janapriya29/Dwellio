import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notificationStreamService } from '../src/services/notificationStream';
import { redisService } from '../src/services/redisService';
import { NotificationData } from '@dwellio/shared';

describe('Phase 5 Remediation: SSE Cross-Instance Redis Pub/Sub Delivery', () => {
  const testUserId = '66f000000000000000000111';

  const mockNotification: NotificationData = {
    id: '66f000000000000000000222',
    recipientId: testUserId,
    type: 'SYSTEM_ANNOUNCEMENT',
    title: 'Cross-Instance Alert',
    message: 'Testing cross-instance delivery through Redis Pub/Sub',
    isRead: false,
    createdAt: new Date().toISOString(),
  };

  const createMockResponse = () => {
    let writtenData = '';
    return {
      writable: true,
      writableEnded: false,
      write: vi.fn((chunk: string) => {
        writtenData += chunk;
        return true;
      }),
      end: vi.fn(),
      getWrittenData: () => writtenData,
    };
  };

  beforeEach(() => {
    notificationStreamService.closeAllClients();
  });

  afterEach(() => {
    notificationStreamService.closeAllClients();
  });

  it('1. Delivers notifications immediately to local connected clients', () => {
    const mockRes = createMockResponse() as any;
    const added = notificationStreamService.addClient(testUserId, mockRes);
    expect(added).toBe(true);

    notificationStreamService.broadcastLocally(testUserId, mockNotification);

    expect(mockRes.write).toHaveBeenCalled();
    expect(mockRes.getWrittenData()).toContain('event: notification');
    expect(mockRes.getWrittenData()).toContain('Cross-Instance Alert');
  });

  it('2. Publishes notification payload to Redis Pub/Sub on broadcastToUser', () => {
    const client = redisService.getClient();
    const publishSpy = vi.spyOn(client, 'publish').mockResolvedValue(1);

    notificationStreamService.broadcastToUser(testUserId, mockNotification);

    expect(publishSpy).toHaveBeenCalled();
    const [channel, messageStr] = publishSpy.mock.calls[0];
    expect(channel).toBe('dwellio:notifications:stream');

    const parsed = JSON.parse(messageStr as string);
    expect(parsed.originId).toBe(notificationStreamService.instanceId);
    expect(parsed.userId).toBe(testUserId);
    expect(parsed.notification.title).toBe('Cross-Instance Alert');

    publishSpy.mockRestore();
  });

  it('3. Receives remote message from peer instance and forwards to local clients', () => {
    const mockRes = createMockResponse() as any;
    notificationStreamService.addClient(testUserId, mockRes);

    const remotePayload = JSON.stringify({
      originId: 'peer_node_9999', // From a different instance
      userId: testUserId,
      notification: mockNotification,
    });

    const handled = notificationStreamService.handleRemoteMessage(remotePayload);
    expect(handled).toBe(true);
    expect(mockRes.write).toHaveBeenCalled();
    expect(mockRes.getWrittenData()).toContain('Cross-Instance Alert');
  });

  it('4. Suppresses duplicate delivery when incoming Pub/Sub message originated locally', () => {
    const mockRes = createMockResponse() as any;
    notificationStreamService.addClient(testUserId, mockRes);

    const selfPayload = JSON.stringify({
      originId: notificationStreamService.instanceId, // Originated from this instance
      userId: testUserId,
      notification: mockNotification,
    });

    const handled = notificationStreamService.handleRemoteMessage(selfPayload);
    expect(handled).toBe(false);
    expect(mockRes.write).not.toHaveBeenCalled();
  });

  it('5. Gracefully handles malformed remote message payloads without crashing', () => {
    const handled = notificationStreamService.handleRemoteMessage('not_valid_json{');
    expect(handled).toBe(false);
  });
});

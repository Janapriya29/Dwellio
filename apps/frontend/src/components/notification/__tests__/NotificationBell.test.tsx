import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NotificationBell } from '../NotificationBell';
import { AuthProvider } from '../../../context/AuthContext';
import * as notificationService from '../../../services/notificationService';
import { NotificationData } from '@dwellio/shared';

// Mock stream service
let streamCallbacks: { onNotification?: (n: any) => void; onError?: (err: any) => void } = {};

vi.mock('../../../services/notificationStreamService', () => ({
  connectNotificationStream: vi.fn((_token: string, callbacks: any) => {
    streamCallbacks = callbacks;
    return vi.fn();
  }),
}));

// Mock the notification service
vi.mock('../../../services/notificationService', () => ({
  fetchNotifications: vi.fn(),
  fetchUnreadNotificationCount: vi.fn(),
  markNotificationAsRead: vi.fn(),
  markAllNotificationsAsRead: vi.fn(),
}));

const mockNotifications: NotificationData[] = [
  {
    id: 'notif-1',
    recipientId: 'demo-customer-id',
    type: 'BOOKING_ACCEPTED',
    title: 'Booking Accepted',
    message: 'Your booking has been accepted by Karthik Raja.',
    bookingId: 'book-100',
    isRead: false,
    readAt: undefined,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5m ago
  },
  {
    id: 'notif-2',
    recipientId: 'demo-customer-id',
    type: 'BOOKING_REQUESTED',
    title: 'New Booking Request',
    message: 'You have a new booking request for Living Room Painting.',
    bookingId: 'book-200',
    isRead: false,
    readAt: undefined,
    createdAt: new Date(Date.now() - 3600 * 1000).toISOString(), // 1h ago
  },
  {
    id: 'notif-3',
    recipientId: 'demo-customer-id',
    type: 'BOOKING_COMPLETED',
    title: 'Service Completed',
    message: 'Your booking has been marked completed.',
    bookingId: 'book-300',
    isRead: true,
    readAt: new Date(Date.now() - 7200 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 86400 * 1000).toISOString(), // 1d ago
  },
];

describe('NotificationBell Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notificationService.fetchUnreadNotificationCount).mockResolvedValue(2);
    vi.mocked(notificationService.fetchNotifications).mockResolvedValue({
      notifications: mockNotifications,
      pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
    });
    vi.mocked(notificationService.markNotificationAsRead).mockResolvedValue({
      ...mockNotifications[0],
      isRead: true,
      readAt: new Date().toISOString(),
    });
    vi.mocked(notificationService.markAllNotificationsAsRead).mockResolvedValue(2);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the bell icon and initial unread badge when unreadCount > 0', async () => {
    render(
      <AuthProvider>
        <NotificationBell />
      </AuthProvider>
    );

    const bellBtn = screen.getByRole('button', { name: /notifications/i });
    expect(bellBtn).toBeInTheDocument();

    await waitFor(() => {
      const badge = screen.getByTestId('notification-unread-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('2');
    });
  });

  it('hides unread badge when unreadCount is 0', async () => {
    vi.mocked(notificationService.fetchUnreadNotificationCount).mockResolvedValue(0);

    render(
      <AuthProvider>
        <NotificationBell />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('notification-unread-badge')).not.toBeInTheDocument();
    });
  });

  it('renders "99+" for unreadCount greater than 99', async () => {
    vi.mocked(notificationService.fetchUnreadNotificationCount).mockResolvedValue(125);

    render(
      <AuthProvider>
        <NotificationBell />
      </AuthProvider>
    );

    await waitFor(() => {
      const badge = screen.getByTestId('notification-unread-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('99+');
    });
  });

  it('toggles dropdown on click and displays notification items', async () => {
    render(
      <AuthProvider>
        <NotificationBell />
      </AuthProvider>
    );

    const bellBtn = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bellBtn);

    // Dropdown appears
    const dropdown = await screen.findByTestId('notification-dropdown');
    expect(dropdown).toBeInTheDocument();

    // Verify notifications fetched and rendered
    await waitFor(() => {
      expect(notificationService.fetchNotifications).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Booking Accepted')).toBeInTheDocument();
      expect(screen.getByText('New Booking Request')).toBeInTheDocument();
      expect(screen.getByText('Service Completed')).toBeInTheDocument();
    });

    // Clicking bell again toggles dropdown off
    fireEvent.click(bellBtn);
    expect(screen.queryByTestId('notification-dropdown')).not.toBeInTheDocument();
  });

  it('closes dropdown on Escape key press', async () => {
    render(
      <AuthProvider>
        <NotificationBell />
      </AuthProvider>
    );

    const bellBtn = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bellBtn);

    expect(await screen.findByTestId('notification-dropdown')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('notification-dropdown')).not.toBeInTheDocument();
  });

  it('closes dropdown on outside click', async () => {
    render(
      <AuthProvider>
        <div>
          <button type="button">Outside Element</button>
          <NotificationBell />
        </div>
      </AuthProvider>
    );

    const bellBtn = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bellBtn);

    expect(await screen.findByTestId('notification-dropdown')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('Outside Element'));
    expect(screen.queryByTestId('notification-dropdown')).not.toBeInTheDocument();
  });

  it('marks a single notification as read and navigates when clicked', async () => {
    const handleNavigate = vi.fn();

    render(
      <AuthProvider>
        <NotificationBell onNavigate={handleNavigate} />
      </AuthProvider>
    );

    // Open dropdown
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await screen.findByTestId('notification-dropdown');

    const item = await screen.findByTestId('notification-item-notif-1');
    fireEvent.click(item);

    // Verify service call
    await waitFor(() => {
      expect(notificationService.markNotificationAsRead).toHaveBeenCalledWith(
        'demo-customer-token',
        'notif-1'
      );
      // Customer booking target tab
      expect(handleNavigate).toHaveBeenCalledWith('my-bookings');
    });

    // Dropdown should be closed after navigation
    expect(screen.queryByTestId('notification-dropdown')).not.toBeInTheDocument();
  });

  it('navigates to provider-portal for BOOKING_REQUESTED notification', async () => {
    const handleNavigate = vi.fn();

    render(
      <AuthProvider>
        <NotificationBell onNavigate={handleNavigate} />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await screen.findByTestId('notification-dropdown');

    const item = await screen.findByTestId('notification-item-notif-2');
    fireEvent.click(item);

    await waitFor(() => {
      expect(handleNavigate).toHaveBeenCalledWith('provider-portal');
    });
  });

  it('marks all notifications as read when clicking "Mark all read"', async () => {
    render(
      <AuthProvider>
        <NotificationBell />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await screen.findByTestId('notification-dropdown');

    const markAllBtn = await screen.findByRole('button', { name: /mark all read/i });
    fireEvent.click(markAllBtn);

    await waitFor(() => {
      expect(notificationService.markAllNotificationsAsRead).toHaveBeenCalledWith(
        'demo-customer-token'
      );
    });

    // Unread count should become 0 and badge disappears
    await waitFor(() => {
      expect(screen.queryByTestId('notification-unread-badge')).not.toBeInTheDocument();
    });
  });

  it('renders empty state when there are no notifications', async () => {
    vi.mocked(notificationService.fetchNotifications).mockResolvedValue({
      notifications: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    render(
      <AuthProvider>
        <NotificationBell />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await screen.findByTestId('notification-dropdown');

    expect(await screen.findByText(/all caught up!/i)).toBeInTheDocument();
    expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument();
  });

  it('renders error state and retries on button click', async () => {
    vi.mocked(notificationService.fetchNotifications)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        notifications: mockNotifications,
        pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
      });

    render(
      <AuthProvider>
        <NotificationBell />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await screen.findByTestId('notification-dropdown');

    expect(await screen.findByText('Network error')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /retry/i });

    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Booking Accepted')).toBeInTheDocument();
    });
  });

  it('increments unread count and displays toast alert when live notification arrives via SSE', async () => {
    render(
      <AuthProvider>
        <NotificationBell />
      </AuthProvider>
    );

    // Initial unread count is 2
    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('2');
    });

    // Simulate incoming SSE event
    act(() => {
      streamCallbacks.onNotification?.({
        id: 'notif-live-99',
        recipientId: 'demo-customer-id',
        type: 'BOOKING_CONFIRMED',
        title: 'Booking Confirmed!',
        message: 'Your service request has been confirmed.',
        bookingId: 'book-999',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    });

    // Unread count should increment from 2 to 3
    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('3');
      expect(screen.getByText('Booking Confirmed!')).toBeInTheDocument();
    });
  });

  it('renders mobile bottom sheet when viewport width is below 640px', async () => {
    // Set viewport to mobile width
    window.innerWidth = 375;
    fireEvent(window, new Event('resize'));

    render(
      <AuthProvider>
        <NotificationBell />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

    const sheet = await screen.findByTestId('notification-bottom-sheet');
    expect(sheet).toBeInTheDocument();

    // Reset back to desktop default
    window.innerWidth = 1024;
    fireEvent(window, new Event('resize'));
  });

  it('triggers onUnreadCountChange callback when unread count is updated or live notification arrives', async () => {
    const handleUnreadCountChange = vi.fn();

    render(
      <AuthProvider>
        <NotificationBell onUnreadCountChange={handleUnreadCountChange} />
      </AuthProvider>
    );

    // Initial count is 2
    await waitFor(() => {
      expect(handleUnreadCountChange).toHaveBeenCalledWith(2);
    });

    // Simulate incoming SSE event
    act(() => {
      streamCallbacks.onNotification?.({
        id: 'notif-live-count-test',
        recipientId: 'demo-customer-id',
        type: 'BOOKING_ACCEPTED',
        title: 'New Alert',
        message: 'Alert message.',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    });

    // Unread count increments to 3 and triggers callback
    await waitFor(() => {
      expect(handleUnreadCountChange).toHaveBeenCalledWith(3);
    });
  });
});

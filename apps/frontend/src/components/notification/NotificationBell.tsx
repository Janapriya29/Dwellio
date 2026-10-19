import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  NotificationData,
  NotificationType,
} from '@dwellio/shared';
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../../services/notificationService';

export interface NotificationBellProps {
  onNavigate?: (tab: 'discover' | 'my-bookings' | 'provider-portal' | 'admin-dashboard') => void;
}

const getNotificationIcon = (type: NotificationType): string => {
  switch (type) {
    case 'BOOKING_REQUESTED':
      return '📅';
    case 'BOOKING_ACCEPTED':
      return '✅';
    case 'BOOKING_REJECTED':
      return '❌';
    case 'BOOKING_ON_THE_WAY':
      return '🚗';
    case 'BOOKING_IN_PROGRESS':
      return '⚙️';
    case 'BOOKING_COMPLETED':
      return '🎉';
    case 'BOOKING_CANCELLED':
      return '⚠️';
    case 'REVIEW_RECEIVED':
      return '⭐';
    case 'REVIEW_REPLIED':
      return '💬';
    case 'APPLICATION_APPROVED':
      return '🛡️';
    case 'APPLICATION_REJECTED':
      return '🛑';
    default:
      return '🔔';
  }
};

const formatRelativeTime = (dateString: string): string => {
  try {
    const now = Date.now();
    const date = new Date(dateString).getTime();
    if (isNaN(date)) return '';
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

const getTargetTab = (
  type: NotificationType,
  userRole?: string
): 'discover' | 'my-bookings' | 'provider-portal' | 'admin-dashboard' => {
  if (type === 'APPLICATION_APPROVED' || type === 'APPLICATION_REJECTED') {
    return userRole === 'admin' ? 'admin-dashboard' : 'provider-portal';
  }
  if (type === 'BOOKING_REQUESTED' || type === 'REVIEW_RECEIVED') {
    return 'provider-portal';
  }
  if (userRole === 'provider') {
    return 'provider-portal';
  }
  return 'my-bookings';
};

export const NotificationBell: React.FC<NotificationBellProps> = ({ onNavigate }) => {
  const { user, token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load unread count safely
  const refreshUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const count = await fetchUnreadNotificationCount(token);
      setUnreadCount(count);
    } catch (err) {
      // Diagnostic log, do not crash UI
      console.warn('Failed to refresh unread notification count:', err);
    }
  }, [token]);

  // Load full notification list for dropdown
  const loadNotifications = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchNotifications(token, { page: 1, limit: 20 });
      setNotifications(res.notifications);
    } catch (err: any) {
      setError(err?.message || 'Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Polling (45s) and visibility/focus refresh
  useEffect(() => {
    if (!token || !user) {
      setUnreadCount(0);
      setNotifications([]);
      setIsOpen(false);
      return;
    }

    // Initial load
    refreshUnreadCount();

    // 45s interval polling while tab is visible
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshUnreadCount();
      }
    }, 45000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshUnreadCount();
      }
    };

    const handleWindowFocus = () => {
      refreshUnreadCount();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [token, user, refreshUnreadCount]);

  // When dropdown opens, fetch notification list and refresh unread count
  useEffect(() => {
    if (isOpen && token) {
      loadNotifications();
      refreshUnreadCount();
    }
  }, [isOpen, token, loadNotifications, refreshUnreadCount]);

  // Click outside and Escape key listeners to close dropdown
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Handle Mark All As Read
  const handleMarkAllRead = async () => {
    if (!token || isMarkingAll || unreadCount === 0) return;
    setIsMarkingAll(true);
    try {
      await markAllNotificationsAsRead(token);
      setUnreadCount(0);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt || new Date().toISOString() }))
      );
    } catch (err: any) {
      console.error('Failed to mark all notifications as read:', err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  // Handle click on an individual notification item
  const handleItemClick = async (item: NotificationData) => {
    if (!item.isRead && token) {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === item.id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        await markNotificationAsRead(token, item.id);
      } catch (err) {
        console.warn('Failed to mark notification as read on server:', err);
      }
    }

    setIsOpen(false);

    // Smart navigation if navigation handler provided
    if (onNavigate) {
      const targetTab = getTargetTab(item.type, user?.role);
      onNavigate(targetTab);
    }
  };

  if (!user || !token) {
    return null;
  }

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 rounded-xl text-dwellio-teal hover:bg-dwellio-mint/20 transition-colors focus:outline-hidden focus:ring-2 focus:ring-dwellio-teal/20"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Unread Count Badge in coral #D9653B */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] px-1 bg-[#D9653B] text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs animate-in fade-in"
            aria-label={`${unreadCount} unread notifications`}
            data-testid="notification-unread-badge"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[30rem] bg-white rounded-2xl shadow-xl border border-dwellio-mint/60 overflow-hidden flex flex-col z-50 animate-in fade-in slide-in-from-top-2 duration-150"
          role="region"
          aria-label="Notification center"
          data-testid="notification-dropdown"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-dwellio-mint/30 flex items-center justify-between bg-dwellio-ivory/50">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-dwellio-teal">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-[11px] font-semibold text-[#D9653B] bg-[#D9653B]/10 px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isMarkingAll}
                className="text-[11px] font-semibold text-dwellio-teal/80 hover:text-dwellio-teal hover:underline disabled:opacity-50 transition"
              >
                {isMarkingAll ? 'Marking...' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* Content Area */}
          <div className="overflow-y-auto max-h-80 divide-y divide-dwellio-mint/20">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-dwellio-teal/60 flex flex-col items-center gap-2">
                <span className="inline-block w-5 h-5 border-2 border-dwellio-teal/30 border-t-dwellio-teal rounded-full animate-spin" />
                <span>Loading notifications...</span>
              </div>
            ) : error ? (
              <div className="p-6 text-center text-xs">
                <p className="text-rose-600 mb-2">{error}</p>
                <button
                  type="button"
                  onClick={loadNotifications}
                  className="px-3 py-1 bg-dwellio-mint/30 text-dwellio-teal rounded-lg font-semibold hover:bg-dwellio-mint/50 transition"
                >
                  Retry
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-dwellio-teal/60">
                <p className="text-2xl mb-1.5">🔔</p>
                <p className="font-semibold text-dwellio-teal">All caught up!</p>
                <p className="mt-0.5">No notifications yet.</p>
              </div>
            ) : (
              notifications.map((item) => {
                const icon = getNotificationIcon(item.type);
                const relativeTime = formatRelativeTime(item.createdAt);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={`w-full text-left p-3.5 flex items-start gap-3 transition-colors focus:outline-hidden ${
                      item.isRead
                        ? 'bg-white hover:bg-dwellio-ivory/40 text-dwellio-teal/80'
                        : 'bg-[#F6F4EC]/90 hover:bg-[#F6F4EC] text-dwellio-teal'
                    }`}
                    data-testid={`notification-item-${item.id}`}
                  >
                    {/* Icon */}
                    <span className="text-xl flex-shrink-0 mt-0.5" aria-hidden="true">
                      {icon}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs truncate ${item.isRead ? 'font-medium' : 'font-bold'}`}>
                          {item.title}
                        </span>
                        {/* Unread indicator dot */}
                        {!item.isRead && (
                          <span
                            className="w-2 h-2 rounded-full bg-[#D9653B] flex-shrink-0"
                            title="Unread"
                            aria-label="Unread"
                          />
                        )}
                      </div>
                      <p className="text-[11px] text-dwellio-teal/70 line-clamp-2 mt-0.5">
                        {item.message}
                      </p>
                      {relativeTime && (
                        <p className="text-[10px] text-dwellio-teal/50 mt-1">
                          {relativeTime}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

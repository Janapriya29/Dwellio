import React, { useEffect, useState } from 'react';
import { NotificationData, NotificationType } from '@dwellio/shared';

export interface ToastItem {
  id: string;
  notification: NotificationData;
}

export interface NotificationToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onView: (notification: NotificationData) => void;
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
    case 'BOOKING_RESCHEDULED':
      return '🔄';
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

const SingleToastCard: React.FC<{
  item: ToastItem;
  onDismiss: (id: string) => void;
  onView: (notification: NotificationData) => void;
}> = ({ item, onDismiss, onView }) => {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // 5-second auto dismiss timer
    const timer = setTimeout(() => {
      setIsFadingOut(true);
      const removeTimer = setTimeout(() => {
        onDismiss(item.id);
      }, 250);
      return () => clearTimeout(removeTimer);
    }, 5000);

    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  const handleDismiss = () => {
    setIsFadingOut(true);
    setTimeout(() => onDismiss(item.id), 200);
  };

  const handleView = () => {
    onView(item.notification);
    onDismiss(item.id);
  };

  const icon = getNotificationIcon(item.notification.type);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={`notification-toast-${item.id}`}
      className={`w-full max-w-sm sm:max-w-md bg-white rounded-2xl shadow-xl border border-dwellio-mint p-3.5 sm:p-4 flex items-start gap-3 transition-all duration-200 pointer-events-auto ${
        isFadingOut
          ? 'opacity-0 translate-y-[-10px] scale-95'
          : 'opacity-100 translate-y-0 scale-100 animate-in fade-in slide-in-from-top-4 duration-200'
      }`}
    >
      <span className="text-2xl flex-shrink-0 mt-0.5" aria-hidden="true">
        {icon}
      </span>

      <div className="flex-1 min-w-0 pr-1">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs sm:text-sm font-bold text-dwellio-teal truncate">
            {item.notification.title}
          </h4>
          <span className="text-[10px] font-bold text-[#D9653B] bg-[#D9653B]/10 px-2 py-0.5 rounded-full flex-shrink-0">
            Just now
          </span>
        </div>

        <p className="text-[11px] sm:text-xs text-dwellio-teal/80 line-clamp-2 mt-0.5">
          {item.notification.message}
        </p>

        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={handleView}
            className="text-[11px] font-bold text-white bg-dwellio-teal hover:bg-dwellio-teal/90 px-3 py-1 rounded-lg transition shadow-xs"
          >
            View
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-[11px] font-medium text-dwellio-teal/60 hover:text-dwellio-teal px-2 py-1 rounded-lg transition"
          >
            Dismiss
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        className="text-dwellio-teal/40 hover:text-dwellio-teal p-1 rounded-lg transition"
        aria-label="Close alert"
      >
        ✕
      </button>
    </div>
  );
};

export const NotificationToastContainer: React.FC<NotificationToastProps> = ({
  toasts,
  onDismiss,
  onView,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-50 top-4 left-4 right-4 sm:left-auto sm:right-6 flex flex-col items-center sm:items-end gap-2.5 pointer-events-none max-w-full"
      aria-label="Live alerts container"
    >
      {toasts.map((toast) => (
        <SingleToastCard
          key={toast.id}
          item={toast}
          onDismiss={onDismiss}
          onView={onView}
        />
      ))}
    </div>
  );
};

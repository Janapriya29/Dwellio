import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NotificationToastContainer, ToastItem } from '../NotificationToast';
import { NotificationData } from '@dwellio/shared';

describe('NotificationToast Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const sampleNotification: NotificationData = {
    id: 'notif-toast-1',
    recipientId: 'cust-1',
    type: 'BOOKING_ACCEPTED',
    title: 'Booking Confirmed!',
    message: 'Karthik Raja has accepted your service booking for Living Room Painting.',
    bookingId: 'book-123',
    isRead: false,
    createdAt: new Date().toISOString(),
  };

  const sampleToasts: ToastItem[] = [
    { id: 'toast-1', notification: sampleNotification },
  ];

  it('renders toast with title, message, and accessibility attributes', () => {
    render(
      <NotificationToastContainer
        toasts={sampleToasts}
        onDismiss={vi.fn()}
        onView={vi.fn()}
      />
    );

    const alertStatus = screen.getByRole('status');
    expect(alertStatus).toBeInTheDocument();
    expect(alertStatus).toHaveAttribute('aria-live', 'polite');

    expect(screen.getByText('Booking Confirmed!')).toBeInTheDocument();
    expect(screen.getByText(/Karthik Raja has accepted/i)).toBeInTheDocument();
    expect(screen.getByText('Just now')).toBeInTheDocument();
  });

  it('triggers onView and onDismiss when clicking "View"', () => {
    const handleView = vi.fn();
    const handleDismiss = vi.fn();

    render(
      <NotificationToastContainer
        toasts={sampleToasts}
        onDismiss={handleDismiss}
        onView={handleView}
      />
    );

    const viewBtn = screen.getByRole('button', { name: /view/i });
    fireEvent.click(viewBtn);

    expect(handleView).toHaveBeenCalledWith(sampleNotification);
    expect(handleDismiss).toHaveBeenCalledWith('toast-1');
  });

  it('triggers onDismiss when clicking "Dismiss" or close button', () => {
    const handleDismiss = vi.fn();

    render(
      <NotificationToastContainer
        toasts={sampleToasts}
        onDismiss={handleDismiss}
        onView={vi.fn()}
      />
    );

    const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissBtn);

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(handleDismiss).toHaveBeenCalledWith('toast-1');
  });

  it('automatically dismisses after 5 seconds', () => {
    const handleDismiss = vi.fn();

    render(
      <NotificationToastContainer
        toasts={sampleToasts}
        onDismiss={handleDismiss}
        onView={vi.fn()}
      />
    );

    expect(handleDismiss).not.toHaveBeenCalled();

    // Advance 5 seconds + animation time
    act(() => {
      vi.advanceTimersByTime(5300);
    });

    expect(handleDismiss).toHaveBeenCalledWith('toast-1');
  });

  it('returns null and renders nothing when toasts array is empty', () => {
    const { container } = render(
      <NotificationToastContainer
        toasts={[]}
        onDismiss={vi.fn()}
        onView={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});

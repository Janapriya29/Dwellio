import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProviderJobDetailsModal } from '../ProviderJobDetailsModal';
import { AuthProvider } from '../../../context/AuthContext';
import * as bookingService from '../../../services/bookingService';
import { BookingData } from '@dwellio/shared';

vi.mock('../../../services/bookingService', () => ({
  acceptProviderBooking: vi.fn(),
  rejectProviderBooking: vi.fn(),
  updateProviderBookingStatus: vi.fn(),
  cancelProviderBooking: vi.fn(),
  fetchProviderBookingById: vi.fn(),
}));

const mockBooking: BookingData = {
  id: 'book-12345',
  serviceId: 'srv-1',
  providerId: 'prov-1',
  providerUserId: 'prov-usr-1',
  categoryId: 'cat-1',
  customerId: 'cust-1',
  scheduledStartTime: '2026-11-25T10:00:00.000Z',
  scheduledEndTime: '2026-11-25T12:00:00.000Z',
  status: 'accepted',
  customerNotes: 'Please ring the doorbell twice.',
  address: {
    street: '42 MG Road, 2nd Floor',
    city: 'Bangalore',
    postalCode: '560001',
  },
  customer: {
    id: 'cust-1',
    name: 'Ananya Deshmukh',
    email: 'ananya@example.com',
    phone: '+91 98765 43210',
  },
  service: {
    id: 'srv-1',
    name: 'Complete Home Deep Cleaning',
    slug: 'deep-cleaning',
  },
  priceSnapshot: 1499,
  statusHistory: [
    {
      actorId: 'cust-1',
      actorRole: 'customer',
      fromStatus: 'requested',
      toStatus: 'requested',
      timestamp: '2026-11-20T08:00:00.000Z',
      reason: 'Initial customer booking',
    },
    {
      actorId: 'user-prov-1',
      actorRole: 'provider',
      fromStatus: 'requested',
      toStatus: 'accepted',
      timestamp: '2026-11-20T09:00:00.000Z',
      reason: 'Slot confirmed by provider',
    },
  ],
  createdAt: '2026-11-20T08:00:00.000Z',
  updatedAt: '2026-11-20T09:00:00.000Z',
};

describe('ProviderJobDetailsModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnStatusUpdated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem(
      'dwellio_user',
      JSON.stringify({
        id: 'user-prov-1',
        name: 'Karthik Raja',
        email: 'karthik@example.com',
        role: 'provider',
        isActive: true,
      })
    );
    localStorage.setItem('dwellio_token', 'valid-provider-jwt');
  });

  it('renders booking details, customer contact links, and map direction link', () => {
    render(
      <AuthProvider>
        <ProviderJobDetailsModal
          booking={mockBooking}
          isOpen={true}
          onClose={mockOnClose}
          onStatusUpdated={mockOnStatusUpdated}
        />
      </AuthProvider>
    );

    // Customer & Job Details
    expect(screen.getByText('Ananya Deshmukh')).toBeInTheDocument();
    expect(screen.getByText('ananya@example.com')).toBeInTheDocument();
    expect(screen.getByText(/\+91 98765 43210/)).toBeInTheDocument();
    expect(screen.getByText(/42 MG Road, 2nd Floor, Bangalore/)).toBeInTheDocument();
    expect(screen.getByText(/Please ring the doorbell twice/)).toBeInTheDocument();

    // 1-Tap Communication Links
    const callLink = screen.getByRole('link', { name: /call/i });
    expect(callLink).toHaveAttribute('href', 'tel:+919876543210');

    const whatsappLink = screen.getByRole('link', { name: /whatsapp/i });
    expect(whatsappLink.getAttribute('href')).toContain('wa.me');

    const smsLink = screen.getByRole('link', { name: /sms/i });
    expect(smsLink).toHaveAttribute('href', 'sms:+919876543210');

    const mapsLink = screen.getByRole('link', { name: /open google maps/i });
    expect(mapsLink.getAttribute('href')).toContain('google.com/maps');

    // Status Timeline
    expect(screen.getByText(/Initial customer booking/)).toBeInTheDocument();
    expect(screen.getByText(/Slot confirmed by provider/)).toBeInTheDocument();
  });

  it('triggers on the way status transition on button click', async () => {
    const updatedBooking: BookingData = { ...mockBooking, status: 'on_the_way' };
    vi.mocked(bookingService.updateProviderBookingStatus).mockResolvedValue(updatedBooking);

    render(
      <AuthProvider>
        <ProviderJobDetailsModal
          booking={mockBooking}
          isOpen={true}
          onClose={mockOnClose}
          onStatusUpdated={mockOnStatusUpdated}
        />
      </AuthProvider>
    );

    const onTheWayBtn = screen.getByRole('button', { name: /on the way/i });
    fireEvent.click(onTheWayBtn);

    await waitFor(() => {
      expect(bookingService.updateProviderBookingStatus).toHaveBeenCalledWith(
        'book-12345',
        'on_the_way',
        undefined,
        'valid-provider-jwt'
      );
      expect(mockOnStatusUpdated).toHaveBeenCalledWith(updatedBooking);
    });
  });

  it('opens cancellation dialog, selects structured chip reason, and cancels booking', async () => {
    const cancelledBooking: BookingData = {
      ...mockBooking,
      status: 'cancelled',
      cancellationReason: 'Vehicle breakdown en route',
    };
    vi.mocked(bookingService.cancelProviderBooking).mockResolvedValue(cancelledBooking);

    render(
      <AuthProvider>
        <ProviderJobDetailsModal
          booking={mockBooking}
          isOpen={true}
          onClose={mockOnClose}
          onStatusUpdated={mockOnStatusUpdated}
        />
      </AuthProvider>
    );

    // Click "Cancel Booking" button to show dialog
    const cancelPromptBtn = screen.getByRole('button', { name: /cancel booking/i });
    fireEvent.click(cancelPromptBtn);

    expect(screen.getByText(/Cancel Booking #-12345/i)).toBeInTheDocument();

    // Select structured reason chip
    const conflictChip = screen.getByRole('button', { name: /Emergency schedule conflict/i });
    fireEvent.click(conflictChip);

    // Confirm Cancellation
    const confirmCancelBtn = screen.getByRole('button', { name: /Confirm Cancellation/i });
    fireEvent.click(confirmCancelBtn);

    await waitFor(() => {
      expect(bookingService.cancelProviderBooking).toHaveBeenCalledWith(
        'book-12345',
        expect.stringContaining('Emergency schedule conflict'),
        'valid-provider-jwt'
      );
      expect(mockOnStatusUpdated).toHaveBeenCalledWith(cancelledBooking);
    });
  });

  it('does not render modal when isOpen is false', () => {
    render(
      <AuthProvider>
        <ProviderJobDetailsModal
          booking={mockBooking}
          isOpen={false}
          onClose={mockOnClose}
          onStatusUpdated={mockOnStatusUpdated}
        />
      </AuthProvider>
    );

    expect(screen.queryByText('Ananya Deshmukh')).not.toBeInTheDocument();
  });
});

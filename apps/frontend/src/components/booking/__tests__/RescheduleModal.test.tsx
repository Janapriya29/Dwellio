import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RescheduleModal } from '../RescheduleModal';
import { AuthProvider } from '../../../context/AuthContext';
import * as bookingService from '../../../services/bookingService';
import * as catalogService from '../../../services/catalogService';
import { BookingData } from '@dwellio/shared';

vi.mock('../../../services/bookingService', () => ({
  rescheduleCustomerBooking: vi.fn(),
}));

vi.mock('../../../services/catalogService', () => ({
  fetchProviderAvailability: vi.fn(),
}));

const mockBooking: BookingData = {
  id: 'book-11223344',
  customerId: 'cust-1',
  providerId: 'pro-1',
  providerUserId: 'user-1',
  serviceId: 'srv-1',
  service: { id: 'srv-1', name: 'Leak Repair', slug: 'leak-repair' },
  categoryId: 'cat-1',
  provider: {
    id: 'pro-1',
    displayName: 'Karthik Raja',
    phone: '9840122334',
    serviceArea: 'Central Metro',
    skills: ['Plumbing'],
  },
  scheduledStartTime: '2026-11-25T09:00:00.000Z',
  scheduledEndTime: '2026-11-25T11:00:00.000Z',
  address: { street: '12 Palm Grove', city: 'Metro' },
  status: 'accepted',
  statusHistory: [],
  createdAt: '2026-11-19T10:00:00.000Z',
  updatedAt: '2026-11-19T10:00:00.000Z',
};

describe('RescheduleModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(catalogService.fetchProviderAvailability).mockResolvedValue({
      providerId: 'pro-1',
      date: '2026-11-20',
      slots: [
        { slotIndex: 0, label: '09:00 AM – 11:00 AM', startTime: '2026-11-20T03:30:00.000Z', endTime: '2026-11-20T05:30:00.000Z', isAvailable: true },
        { slotIndex: 1, label: '11:30 AM – 01:30 PM', startTime: '2026-11-20T06:00:00.000Z', endTime: '2026-11-20T08:00:00.000Z', isAvailable: false, reason: 'Booked' },
        { slotIndex: 2, label: '02:00 PM – 04:00 PM', startTime: '2026-11-20T08:30:00.000Z', endTime: '2026-11-20T10:30:00.000Z', isAvailable: true },
        { slotIndex: 3, label: '04:30 PM – 06:30 PM', startTime: '2026-11-20T11:00:00.000Z', endTime: '2026-11-20T13:00:00.000Z', isAvailable: true },
      ],
    });
  });

  it('renders booking details and loads provider availability', async () => {
    render(
      <AuthProvider>
        <RescheduleModal
          isOpen={true}
          booking={mockBooking}
          onClose={vi.fn()}
          onRescheduleSuccess={vi.fn()}
        />
      </AuthProvider>
    );

    expect(screen.getByRole('heading', { name: /reschedule appointment/i })).toBeInTheDocument();
    expect(screen.getByText('Leak Repair')).toBeInTheDocument();
    expect(screen.getByText('Karthik Raja')).toBeInTheDocument();

    await waitFor(() => {
      // Slot 1 should be disabled
      const slot1Btn = screen.getByRole('button', { name: /11:30 AM – 01:30 PM/i });
      expect(slot1Btn).toBeDisabled();

      // Slot 0 should be enabled
      const slot0Btn = screen.getByRole('button', { name: /09:00 AM – 11:00 AM/i });
      expect(slot0Btn).not.toBeDisabled();
    });
  });

  it('submits reschedule request and calls onRescheduleSuccess', async () => {
    const mockUpdatedBooking: BookingData = {
      ...mockBooking,
      scheduledStartTime: '2026-11-26T09:00:00.000Z',
      scheduledEndTime: '2026-11-26T11:00:00.000Z',
    };

    vi.mocked(bookingService.rescheduleCustomerBooking).mockResolvedValue(mockUpdatedBooking);
    const mockSuccess = vi.fn();
    const mockClose = vi.fn();

    render(
      <AuthProvider>
        <RescheduleModal
          isOpen={true}
          booking={mockBooking}
          onClose={mockClose}
          onRescheduleSuccess={mockSuccess}
        />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(catalogService.fetchProviderAvailability).toHaveBeenCalled();
    });

    // Enter optional reason
    fireEvent.change(screen.getByLabelText(/reason for rescheduling/i), {
      target: { value: 'Work conference on previous date' },
    });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /confirm reschedule/i }));

    await waitFor(() => {
      expect(bookingService.rescheduleCustomerBooking).toHaveBeenCalledWith(
        'book-11223344',
        expect.objectContaining({
          reason: 'Work conference on previous date',
        }),
        expect.anything()
      );
      expect(mockSuccess).toHaveBeenCalledWith(mockUpdatedBooking);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  it('handles 409 conflict: displays error message and refreshes provider availability', async () => {
    const conflictError: any = new Error('The service professional has an overlapping appointment.');
    conflictError.status = 409;
    vi.mocked(bookingService.rescheduleCustomerBooking).mockRejectedValue(conflictError);

    render(
      <AuthProvider>
        <RescheduleModal
          isOpen={true}
          booking={mockBooking}
          onClose={vi.fn()}
          onRescheduleSuccess={vi.fn()}
        />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(catalogService.fetchProviderAvailability).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /confirm reschedule/i }));

    await waitFor(() => {
      expect(screen.getByText(/overlapping appointment/i)).toBeInTheDocument();
      // Should have re-fetched availability to refresh available slots
      expect(catalogService.fetchProviderAvailability).toHaveBeenCalledTimes(2);
    });
  });
});

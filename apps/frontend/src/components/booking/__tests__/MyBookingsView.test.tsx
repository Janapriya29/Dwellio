import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MyBookingsView } from '../MyBookingsView';
import { AuthProvider } from '../../../context/AuthContext';
import * as bookingService from '../../../services/bookingService';
import { BookingData } from '@dwellio/shared';

vi.mock('../../../services/bookingService', () => ({
  fetchCustomerBookings: vi.fn(),
  cancelCustomerBooking: vi.fn(),
}));

const mockBookings: BookingData[] = [
  {
    id: 'book-00112233',
    customerId: 'cust-1',
    providerId: 'pro-1',
    providerUserId: 'user-1',
    serviceId: 'srv-1',
    service: { id: 'srv-1', name: 'Switchboard Repair', slug: 'switchboard-repair' },
    categoryId: 'cat-1',
    provider: {
      id: 'pro-1',
      displayName: 'Karthik Raja',
      phone: '9840122334',
      serviceArea: 'Central Metro',
      skills: ['Electrician'],
    },
    scheduledStartTime: '2026-10-21T09:00:00.000Z',
    scheduledEndTime: '2026-10-21T11:00:00.000Z',
    address: { street: '12 Palm Grove', city: 'Metro' },
    status: 'requested',
    statusHistory: [
      {
        actorId: 'cust-1',
        actorRole: 'customer',
        fromStatus: 'requested',
        toStatus: 'requested',
        timestamp: '2026-10-19T10:00:00.000Z',
        reason: 'Initial request',
      },
    ],
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
  },
];

describe('MyBookingsView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders list of customer bookings with status and details', async () => {
    vi.mocked(bookingService.fetchCustomerBookings).mockResolvedValue(mockBookings);

    render(
      <AuthProvider>
        <MyBookingsView onExploreServices={vi.fn()} />
      </AuthProvider>
    );

    expect(screen.getByRole('heading', { name: /my service bookings/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Switchboard Repair')).toBeInTheDocument();
      expect(screen.getByText('Karthik Raja')).toBeInTheDocument();
      expect(screen.getAllByText(/requested/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('button', { name: /cancel booking/i })).toBeInTheDocument();
    });
  });

  it('allows customer to open cancellation dialog and cancel a booking', async () => {
    vi.mocked(bookingService.fetchCustomerBookings).mockResolvedValue(mockBookings);
    vi.mocked(bookingService.cancelCustomerBooking).mockResolvedValue({
      ...mockBookings[0],
      status: 'cancelled',
    });

    render(
      <AuthProvider>
        <MyBookingsView onExploreServices={vi.fn()} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel booking/i })).toBeInTheDocument();
    });

    // Open cancellation dialog
    fireEvent.click(screen.getByRole('button', { name: /cancel booking/i }));
    expect(screen.getByText('Cancel Service Booking?')).toBeInTheDocument();

    // Confirm cancellation
    fireEvent.click(screen.getByRole('button', { name: /confirm cancellation/i }));

    await waitFor(() => {
      expect(bookingService.cancelCustomerBooking).toHaveBeenCalledWith(
        'book-00112233',
        expect.anything(),
        expect.anything()
      );
    });
  });

  it('renders empty state when no bookings exist', async () => {
    vi.mocked(bookingService.fetchCustomerBookings).mockResolvedValue([]);

    render(
      <AuthProvider>
        <MyBookingsView onExploreServices={vi.fn()} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('No Bookings Found')).toBeInTheDocument();
    });
  });

  it('renders Reschedule button for eligible requested/accepted bookings and opens RescheduleModal', async () => {
    vi.mocked(bookingService.fetchCustomerBookings).mockResolvedValue(mockBookings);

    render(
      <AuthProvider>
        <MyBookingsView onExploreServices={vi.fn()} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reschedule/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /reschedule/i }));

    expect(screen.getByRole('heading', { name: /reschedule appointment/i })).toBeInTheDocument();
  });

  it('does not render Reschedule or Cancel buttons for completed or cancelled bookings', async () => {
    const terminalBookings: BookingData[] = [
      {
        ...mockBookings[0],
        id: 'book-completed',
        status: 'completed',
      },
      {
        ...mockBookings[0],
        id: 'book-cancelled',
        status: 'cancelled',
      },
    ];

    vi.mocked(bookingService.fetchCustomerBookings).mockResolvedValue(terminalBookings);

    render(
      <AuthProvider>
        <MyBookingsView onExploreServices={vi.fn()} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /reschedule/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /cancel booking/i })).not.toBeInTheDocument();
    });
  });
});

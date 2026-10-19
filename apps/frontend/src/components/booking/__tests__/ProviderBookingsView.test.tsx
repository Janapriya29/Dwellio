import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProviderBookingsView } from '../ProviderBookingsView';
import { AuthProvider } from '../../../context/AuthContext';
import * as bookingService from '../../../services/bookingService';
import { BookingData } from '@dwellio/shared';

vi.mock('../../../services/bookingService', () => ({
  fetchProviderBookings: vi.fn(),
  acceptProviderBooking: vi.fn(),
  rejectProviderBooking: vi.fn(),
  updateProviderBookingStatus: vi.fn(),
}));

const mockIncomingRequest: BookingData = {
  id: 'book-req-001',
  customerId: 'cust-1',
  customer: { id: 'cust-1', name: 'Alice Customer', email: 'alice@example.com' },
  providerId: 'pro-1',
  providerUserId: 'user-1',
  serviceId: 'srv-1',
  service: { id: 'srv-1', name: 'Switchboard Repair', slug: 'switchboard-repair' },
  categoryId: 'cat-1',
  scheduledStartTime: '2026-10-21T09:00:00.000Z',
  scheduledEndTime: '2026-10-21T11:00:00.000Z',
  address: { street: '12 Palm Grove', city: 'Metro' },
  status: 'requested',
  statusHistory: [],
  createdAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T10:00:00.000Z',
};

const mockAcceptedJob: BookingData = {
  id: 'book-acc-002',
  customerId: 'cust-2',
  customer: { id: 'cust-2', name: 'Bob Customer', email: 'bob@example.com' },
  providerId: 'pro-1',
  providerUserId: 'user-1',
  serviceId: 'srv-1',
  service: { id: 'srv-1', name: 'AC Servicing', slug: 'ac-servicing' },
  categoryId: 'cat-1',
  scheduledStartTime: '2026-10-21T14:00:00.000Z',
  scheduledEndTime: '2026-10-21T16:00:00.000Z',
  address: { street: '78 Oak Road', city: 'Metro' },
  status: 'accepted',
  statusHistory: [],
  createdAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T10:00:00.000Z',
};

describe('ProviderBookingsView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders incoming requests and active jobs sections', async () => {
    vi.mocked(bookingService.fetchProviderBookings).mockResolvedValue([
      mockIncomingRequest,
      mockAcceptedJob,
    ]);

    render(
      <AuthProvider>
        <ProviderBookingsView />
      </AuthProvider>
    );

    expect(screen.getByRole('heading', { name: /provider booking management/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Incoming Requests')).toBeInTheDocument();
      expect(screen.getByText('Switchboard Repair')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /accept & reserve slot/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();

      expect(screen.getByText('Active & En Route Jobs')).toBeInTheDocument();
      expect(screen.getByText('AC Servicing')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /mark on the way/i })).toBeInTheDocument();
    });
  });

  it('handles provider accepting an incoming request', async () => {
    vi.mocked(bookingService.fetchProviderBookings).mockResolvedValue([mockIncomingRequest]);
    vi.mocked(bookingService.acceptProviderBooking).mockResolvedValue({
      ...mockIncomingRequest,
      status: 'accepted',
    });

    render(
      <AuthProvider>
        <ProviderBookingsView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /accept & reserve slot/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /accept & reserve slot/i }));

    await waitFor(() => {
      expect(bookingService.acceptProviderBooking).toHaveBeenCalledWith(
        'book-req-001',
        expect.anything()
      );
    });
  });

  it('handles provider advancing job progress status', async () => {
    vi.mocked(bookingService.fetchProviderBookings).mockResolvedValue([mockAcceptedJob]);
    vi.mocked(bookingService.updateProviderBookingStatus).mockResolvedValue({
      ...mockAcceptedJob,
      status: 'on_the_way',
    });

    render(
      <AuthProvider>
        <ProviderBookingsView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mark on the way/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /mark on the way/i }));

    await waitFor(() => {
      expect(bookingService.updateProviderBookingStatus).toHaveBeenCalledWith(
        'book-acc-002',
        'on_the_way',
        undefined,
        expect.anything()
      );
    });
  });
});

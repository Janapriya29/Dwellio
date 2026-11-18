import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BookingModal } from '../BookingModal';
import { AuthProvider } from '../../../context/AuthContext';
import * as bookingService from '../../../services/bookingService';
import { PublicProviderData, ServiceData, BookingData } from '@dwellio/shared';

vi.mock('../../../services/bookingService', () => ({
  createBooking: vi.fn(),
}));

const mockProvider: PublicProviderData = {
  id: 'pro-1',
  userId: 'user-1',
  displayName: 'Karthik Raja',
  phone: '9840122334',
  serviceArea: 'Central Metro',
  skills: ['Waterproofing', 'Roof repair'],
  verificationStatus: 'approved',
  ratingAverage: 4.9,
  reviewCount: 8,
  createdAt: '2026-10-19T00:00:00.000Z',
};

const mockServices: ServiceData[] = [
  {
    id: 'srv-1',
    categoryId: 'cat-1',
    name: 'Terrace Waterproofing',
    slug: 'terrace-waterproofing',
    isActive: true,
    createdAt: '2026-10-19T00:00:00.000Z',
    updatedAt: '2026-10-19T00:00:00.000Z',
  },
];

describe('BookingModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders booking form with provider details and form controls', () => {
    render(
      <AuthProvider>
        <BookingModal
          isOpen={true}
          provider={mockProvider}
          services={mockServices}
          selectedRoom="roof"
          onClose={vi.fn()}
        />
      </AuthProvider>
    );

    expect(screen.getByRole('heading', { name: /book karthik raja/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/service specialty/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/appointment date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/street address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & request booking/i })).toBeInTheDocument();
  });

  it('submits booking and displays confirmation screen on success', async () => {
    const mockCreatedBooking: BookingData = {
      id: 'book-12345678',
      customerId: 'cust-1',
      providerId: 'pro-1',
      providerUserId: 'user-1',
      serviceId: 'srv-1',
      categoryId: 'cat-1',
      scheduledStartTime: '2026-10-21T09:00:00.000Z',
      scheduledEndTime: '2026-10-21T11:00:00.000Z',
      address: { street: '42 Palm Ave', city: 'Chennai' },
      status: 'requested',
      statusHistory: [],
      createdAt: '2026-10-19T00:00:00.000Z',
      updatedAt: '2026-10-19T00:00:00.000Z',
    };

    vi.mocked(bookingService.createBooking).mockResolvedValue(mockCreatedBooking);

    render(
      <AuthProvider>
        <BookingModal
          isOpen={true}
          provider={mockProvider}
          services={mockServices}
          selectedRoom="roof"
          onClose={vi.fn()}
        />
      </AuthProvider>
    );

    const submitBtn = screen.getByRole('button', { name: /confirm & request booking/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Booking Request Submitted!')).toBeInTheDocument();
      expect(screen.getByText(/12345678/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /done & view bookings/i })).toBeInTheDocument();
    });
  });

  it('correctly converts local appointment selection to UTC ISO 8601 without unwanted timezone shift', async () => {
    vi.mocked(bookingService.createBooking).mockResolvedValue({
      id: 'book-timezone-test',
      customerId: 'cust-1',
      providerId: 'pro-1',
      providerUserId: 'user-1',
      serviceId: 'srv-1',
      categoryId: 'cat-1',
      scheduledStartTime: '2026-10-25T03:30:00.000Z',
      scheduledEndTime: '2026-10-25T05:30:00.000Z',
      address: { street: '42 Palm Ave', city: 'Chennai' },
      status: 'requested',
      statusHistory: [],
      createdAt: '2026-10-19T00:00:00.000Z',
      updatedAt: '2026-10-19T00:00:00.000Z',
    });

    render(
      <AuthProvider>
        <BookingModal
          isOpen={true}
          provider={mockProvider}
          services={mockServices}
          selectedRoom="roof"
          onClose={vi.fn()}
        />
      </AuthProvider>
    );

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    const targetDay = targetDate.getDate();
    const formattedDate = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

    const dateInput = screen.getByLabelText(/appointment date/i);
    fireEvent.change(dateInput, { target: { value: formattedDate } });

    const submitBtn = screen.getByRole('button', { name: /confirm & request booking/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(bookingService.createBooking).toHaveBeenCalledTimes(1);
    });

    // Verify local Date was converted to ISO string
    const callArgs = vi.mocked(bookingService.createBooking).mock.calls[0][0];
    const expectedLocalStart = new Date(targetYear, targetMonth, targetDay, 9, 0, 0, 0).toISOString();
    const expectedLocalEnd = new Date(targetYear, targetMonth, targetDay, 11, 0, 0, 0).toISOString();

    expect(callArgs.scheduledStartTime).toBe(expectedLocalStart);
    expect(callArgs.scheduledEndTime).toBe(expectedLocalEnd);
  });
});

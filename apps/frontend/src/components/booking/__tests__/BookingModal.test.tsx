import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BookingModal } from '../BookingModal';
import { AuthProvider } from '../../../context/AuthContext';
import * as bookingService from '../../../services/bookingService';
import * as catalogService from '../../../services/catalogService';
import { PublicProviderData, ServiceData, BookingData } from '@dwellio/shared';

vi.mock('../../../services/bookingService', () => ({
  createBooking: vi.fn(),
}));

vi.mock('../../../services/catalogService', () => ({
  fetchProviderAvailability: vi.fn(),
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
    localStorage.clear();

    // Default mock availability: all slots available
    vi.mocked(catalogService.fetchProviderAvailability).mockResolvedValue({
      providerId: 'pro-1',
      date: '2026-11-20',
      slots: [
        { slotIndex: 0, label: '09:00 AM – 11:00 AM', startTime: '2026-11-20T03:30:00.000Z', endTime: '2026-11-20T05:30:00.000Z', isAvailable: true },
        { slotIndex: 1, label: '11:30 AM – 01:30 PM', startTime: '2026-11-20T06:00:00.000Z', endTime: '2026-11-20T08:00:00.000Z', isAvailable: true },
        { slotIndex: 2, label: '02:00 PM – 04:00 PM', startTime: '2026-11-20T08:30:00.000Z', endTime: '2026-11-20T10:30:00.000Z', isAvailable: true },
        { slotIndex: 3, label: '04:30 PM – 06:30 PM', startTime: '2026-11-20T11:00:00.000Z', endTime: '2026-11-20T13:00:00.000Z', isAvailable: true },
      ],
    });
  });

  it('renders booking form with provider details, pricing notice, and form controls', async () => {
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

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /book karthik raja/i })).toBeInTheDocument();
      expect(screen.queryByText(/checking availability/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/admin verified/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/service specialty/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/appointment date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/street address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & request booking/i })).toBeInTheDocument();

    // Verify transparent pricing notice without crediting commitments
    expect(screen.getByText(/transparent pricing:/i)).toBeInTheDocument();
    expect(screen.getByText(/indicative diagnostic visit from/i)).toBeInTheDocument();
    expect(screen.getByText(/₹499/)).toBeInTheDocument();
    expect(screen.queryByText(/credited if service is performed/i)).not.toBeInTheDocument();
  });

  it('submits booking and displays confirmation screen on success, persisting address to localStorage', async () => {
    const mockCreatedBooking: BookingData = {
      id: 'book-12345678',
      customerId: 'cust-1',
      providerId: 'pro-1',
      providerUserId: 'user-1',
      serviceId: 'srv-1',
      categoryId: 'cat-1',
      scheduledStartTime: '2026-10-21T09:00:00.000Z',
      scheduledEndTime: '2026-10-21T11:00:00.000Z',
      address: { street: '15 Anna Salai', city: 'Chennai', postalCode: '600002' },
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

    // Fill in customer address
    fireEvent.change(screen.getByLabelText(/street address/i), { target: { value: '15 Anna Salai' } });
    fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'Chennai' } });
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: '600002' } });

    const submitBtn = screen.getByRole('button', { name: /confirm & request booking/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Booking Request Submitted!')).toBeInTheDocument();
      expect(screen.getByText(/12345678/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /done & view bookings/i })).toBeInTheDocument();
    });

    // Check localStorage saved the address
    const saved = JSON.parse(localStorage.getItem('dwellio_customer_address') || '{}');
    expect(saved.street).toBe('15 Anna Salai');
    expect(saved.city).toBe('Chennai');
    expect(saved.postalCode).toBe('600002');
  });

  it('pre-fills address fields from localStorage when a saved customer address exists', async () => {
    localStorage.setItem(
      'dwellio_customer_address',
      JSON.stringify({ street: '88 Beach Road', city: 'Chennai', postalCode: '600041' })
    );

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

    await waitFor(() => {
      expect(screen.getByLabelText(/street address/i)).toHaveValue('88 Beach Road');
      expect(screen.queryByText(/checking availability/i)).not.toBeInTheDocument();
    });

    expect(screen.getByLabelText(/city/i)).toHaveValue('Chennai');
    expect(screen.getByLabelText(/postal code/i)).toHaveValue('600041');
  });

  it('dynamically disables unavailable slots based on backend availability response', async () => {
    // Return slot 0 (09:00 AM - 11:00 AM) as unavailable
    vi.mocked(catalogService.fetchProviderAvailability).mockResolvedValue({
      providerId: 'pro-1',
      date: '2026-11-20',
      slots: [
        { slotIndex: 0, label: '09:00 AM – 11:00 AM', startTime: '2026-11-20T03:30:00.000Z', endTime: '2026-11-20T05:30:00.000Z', isAvailable: false, reason: 'Booked' },
        { slotIndex: 1, label: '11:30 AM – 01:30 PM', startTime: '2026-11-20T06:00:00.000Z', endTime: '2026-11-20T08:00:00.000Z', isAvailable: true },
        { slotIndex: 2, label: '02:00 PM – 04:00 PM', startTime: '2026-11-20T08:30:00.000Z', endTime: '2026-11-20T10:30:00.000Z', isAvailable: true },
        { slotIndex: 3, label: '04:30 PM – 06:30 PM', startTime: '2026-11-20T11:00:00.000Z', endTime: '2026-11-20T13:00:00.000Z', isAvailable: true },
      ],
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

    await waitFor(() => {
      const slot0Btn = screen.getByRole('button', { name: /09:00 AM – 11:00 AM/i });
      expect(slot0Btn).toBeDisabled();
      expect(screen.getByText('Unavailable')).toBeInTheDocument();

      const slot1Btn = screen.getByRole('button', { name: /11:30 AM – 01:30 PM/i });
      expect(slot1Btn).not.toBeDisabled();
    });
  });

  it('navigates to #/bookings when Done & View Bookings button is clicked', async () => {
    const mockNavigate = vi.fn();
    const mockClose = vi.fn();

    vi.mocked(bookingService.createBooking).mockResolvedValue({
      id: 'book-nav-test',
      customerId: 'cust-1',
      providerId: 'pro-1',
      providerUserId: 'user-1',
      serviceId: 'srv-1',
      categoryId: 'cat-1',
      scheduledStartTime: '2026-10-21T09:00:00.000Z',
      scheduledEndTime: '2026-10-21T11:00:00.000Z',
      address: { street: '123 Main St', city: 'Chennai' },
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
          onClose={mockClose}
          onNavigateToBookings={mockNavigate}
        />
      </AuthProvider>
    );

    // Provide address
    fireEvent.change(screen.getByLabelText(/street address/i), { target: { value: '123 Main St' } });
    fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'Chennai' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /confirm & request booking/i });
    fireEvent.click(submitBtn);

    const doneBtn = await screen.findByRole('button', { name: /done & view bookings/i });
    fireEvent.click(doneBtn);

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
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

    // Set address
    fireEvent.change(screen.getByLabelText(/street address/i), { target: { value: '42 Palm Ave' } });
    fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'Chennai' } });

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

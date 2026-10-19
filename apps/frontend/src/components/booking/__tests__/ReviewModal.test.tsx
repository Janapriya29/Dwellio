import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewModal } from '../ReviewModal';
import { AuthProvider } from '../../../context/AuthContext';
import * as reviewService from '../../../services/reviewService';
import { BookingData, ReviewData } from '@dwellio/shared';

vi.mock('../../../services/reviewService', () => ({
  createBookingReview: vi.fn(),
}));

const mockBooking: BookingData = {
  id: 'book-12345678',
  customerId: 'cust-1',
  providerId: 'pro-1',
  providerUserId: 'user-1',
  serviceId: 'srv-1',
  categoryId: 'cat-1',
  service: {
    id: 'srv-1',
    name: 'Roof Waterproofing',
    slug: 'roof-waterproofing',
  },
  provider: {
    id: 'pro-1',
    displayName: 'Karthik Raja',
    phone: '9840122334',
    serviceArea: 'Central Metro',
    skills: ['Waterproofing', 'Roof Repair'],
  },
  status: 'completed',
  scheduledStartTime: '2026-10-19T09:00:00.000Z',
  scheduledEndTime: '2026-10-19T11:00:00.000Z',
  address: {
    street: '12 Anna Salai',
    city: 'Chennai',
    postalCode: '600002',
  },
  statusHistory: [
    {
      actorId: 'cust-1',
      actorRole: 'customer',
      fromStatus: 'requested',
      toStatus: 'requested',
      timestamp: '2026-10-19T08:00:00.000Z',
    },
    {
      actorId: 'pro-1',
      actorRole: 'provider',
      fromStatus: 'requested',
      toStatus: 'accepted',
      timestamp: '2026-10-19T08:15:00.000Z',
    },
    {
      actorId: 'pro-1',
      actorRole: 'provider',
      fromStatus: 'accepted',
      toStatus: 'completed',
      timestamp: '2026-10-19T11:00:00.000Z',
    },
  ],
  createdAt: '2026-10-19T08:00:00.000Z',
  updatedAt: '2026-10-19T11:00:00.000Z',
};

const mockCreatedReview: ReviewData = {
  id: 'rev-1',
  bookingId: 'book-12345678',
  customerId: 'cust-1',
  providerId: 'pro-1',
  serviceId: 'srv-1',
  rating: 5,
  comment: 'Outstanding and professional workmanship!',
  isPublished: true,
  createdAt: '2026-10-19T12:00:00.000Z',
  updatedAt: '2026-10-19T12:00:00.000Z',
};

describe('ReviewModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    render(
      <AuthProvider>
        <ReviewModal
          isOpen={false}
          onClose={vi.fn()}
          booking={mockBooking}
        />
      </AuthProvider>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders modal with booking details and default 5-star rating when isOpen is true', () => {
    render(
      <AuthProvider>
        <ReviewModal
          isOpen={true}
          onClose={vi.fn()}
          booking={mockBooking}
        />
      </AuthProvider>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Rate Your Experience')).toBeInTheDocument();
    expect(screen.getByText('Roof Waterproofing')).toBeInTheDocument();
    expect(screen.getByText('Karthik Raja')).toBeInTheDocument();
    expect(screen.getByText('⭐️⭐️⭐️⭐️⭐️ Outstanding Service')).toBeInTheDocument();

    const starButtons = screen.getAllByRole('radio');
    expect(starButtons).toHaveLength(5);
    expect(starButtons[4]).toHaveAttribute('aria-checked', 'true');
  });

  it('updates selected rating and descriptive label on star click', () => {
    render(
      <AuthProvider>
        <ReviewModal
          isOpen={true}
          onClose={vi.fn()}
          booking={mockBooking}
        />
      </AuthProvider>
    );

    const starButtons = screen.getAllByRole('radio');
    fireEvent.click(starButtons[3]); // 4 stars

    expect(starButtons[3]).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('⭐️⭐️⭐️⭐️ Very Good Experience')).toBeInTheDocument();
  });

  it('validates short comment length on submission', async () => {
    render(
      <AuthProvider>
        <ReviewModal
          isOpen={true}
          onClose={vi.fn()}
          booking={mockBooking}
        />
      </AuthProvider>
    );

    const commentInput = screen.getByPlaceholderText(/share your experience/i);
    fireEvent.change(commentInput, { target: { value: 'Too short' } }); // 9 chars

    const submitBtn = screen.getByRole('button', { name: /publish verified review/i });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText('If providing written feedback, please enter at least 10 characters.')
    ).toBeInTheDocument();
    expect(reviewService.createBookingReview).not.toHaveBeenCalled();
  });

  it('successfully submits review and triggers onReviewSuccess callback', async () => {
    vi.mocked(reviewService.createBookingReview).mockResolvedValueOnce(mockCreatedReview);
    const onReviewSuccessMock = vi.fn();

    render(
      <AuthProvider>
        <ReviewModal
          isOpen={true}
          onClose={vi.fn()}
          booking={mockBooking}
          onReviewSuccess={onReviewSuccessMock}
        />
      </AuthProvider>
    );

    const commentInput = screen.getByPlaceholderText(/share your experience/i);
    fireEvent.change(commentInput, {
      target: { value: 'Outstanding and professional workmanship!' },
    });

    const submitBtn = screen.getByRole('button', { name: /publish verified review/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(reviewService.createBookingReview).toHaveBeenCalledWith(
        mockBooking.id,
        {
          rating: 5,
          comment: 'Outstanding and professional workmanship!',
        },
        expect.any(String)
      );
    });

    expect(await screen.findByText('Review Submitted!')).toBeInTheDocument();
    expect(onReviewSuccessMock).toHaveBeenCalledWith(mockCreatedReview);
  });

  it('displays API error message when submission fails', async () => {
    vi.mocked(reviewService.createBookingReview).mockRejectedValueOnce(
      new Error('This booking has already been reviewed.')
    );

    render(
      <AuthProvider>
        <ReviewModal
          isOpen={true}
          onClose={vi.fn()}
          booking={mockBooking}
        />
      </AuthProvider>
    );

    const submitBtn = screen.getByRole('button', { name: /publish verified review/i });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText('This booking has already been reviewed.')
    ).toBeInTheDocument();
  });
});

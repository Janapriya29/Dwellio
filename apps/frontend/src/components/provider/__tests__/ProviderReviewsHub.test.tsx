import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProviderReviewsHub } from '../ProviderReviewsHub';
import { AuthProvider } from '../../../context/AuthContext';
import * as providerService from '../../../services/providerService';
import * as reviewService from '../../../services/reviewService';
import { ProviderReviewsData } from '@dwellio/shared';

vi.mock('../../../services/providerService', () => ({
  fetchProviderReviews: vi.fn(),
}));

vi.mock('../../../services/reviewService', () => ({
  replyToReview: vi.fn(),
}));

const mockReviewsData: ProviderReviewsData = {
  reviews: [
    {
      id: 'rev-1',
      bookingId: 'book-1',
      customerId: 'cust-1',
      customer: { id: 'cust-1', name: 'Deepa Nair' },
      providerId: 'prov-1',
      serviceId: 'srv-1',
      service: { id: 'srv-1', name: 'Terrace Waterproofing', slug: 'terrace-waterproofing' },
      rating: 5,
      comment: 'Exceptional waterproofing work done cleanly.',
      isPublished: true,
      createdAt: '2026-11-18T10:00:00.000Z',
      updatedAt: '2026-11-18T10:00:00.000Z',
    },
    {
      id: 'rev-2',
      bookingId: 'book-2',
      customerId: 'cust-2',
      customer: { id: 'cust-2', name: 'Vikram Joshi' },
      providerId: 'prov-1',
      serviceId: 'srv-1',
      service: { id: 'srv-1', name: 'Terrace Waterproofing', slug: 'terrace-waterproofing' },
      rating: 4,
      comment: 'Good overall, neat finishing.',
      providerReply: {
        replyText: 'Thank you for your valuable feedback, Vikram!',
        repliedAt: '2026-11-19T12:00:00.000Z',
      },
      isPublished: true,
      createdAt: '2026-11-17T10:00:00.000Z',
      updatedAt: '2026-11-19T12:00:00.000Z',
    },
  ],
  pagination: {
    page: 1,
    limit: 8,
    total: 2,
    totalPages: 1,
  },
  summary: {
    ratingAverage: 4.5,
    reviewCount: 2,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 },
  },
};

describe('ProviderReviewsHub Component', () => {
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
    vi.mocked(providerService.fetchProviderReviews).mockResolvedValue(mockReviewsData);
  });

  it('renders reviews summary header, distribution bars, and reviews list', async () => {
    render(
      <AuthProvider>
        <ProviderReviewsHub />
      </AuthProvider>
    );

    expect(await screen.findByText('Customer Reviews Hub')).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('2 Total Reviews')).toBeInTheDocument();

    // Reviews list
    expect(screen.getByText('Deepa Nair')).toBeInTheDocument();
    expect(screen.getByText(/Exceptional waterproofing work done cleanly/)).toBeInTheDocument();
    expect(screen.getByText('Vikram Joshi')).toBeInTheDocument();
    expect(screen.getByText(/Thank you for your valuable feedback, Vikram!/)).toBeInTheDocument();
  });

  it('opens reply composer, enters valid reply, and submits', async () => {
    const updatedReview = {
      ...mockReviewsData.reviews[0],
      providerReply: {
        replyText: 'Thank you Deepa! Always here to assist.',
        repliedAt: '2026-11-20T11:00:00.000Z',
      },
    };
    vi.mocked(reviewService.replyToReview).mockResolvedValue(updatedReview);

    render(
      <AuthProvider>
        <ProviderReviewsHub />
      </AuthProvider>
    );

    const replyBtn = await screen.findByRole('button', { name: /reply to review/i });
    fireEvent.click(replyBtn);

    expect(screen.getByText(/Write One-Time Public Reply:/i)).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/Thank the homeowner or address their feedback/i);
    fireEvent.change(textarea, { target: { value: 'Thank you Deepa! Always here to assist.' } });

    const publishBtn = screen.getByRole('button', { name: /publish public reply/i });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(reviewService.replyToReview).toHaveBeenCalledWith(
        'rev-1',
        { replyText: 'Thank you Deepa! Always here to assist.' },
        'valid-provider-jwt'
      );
      expect(screen.getByText('Thank you Deepa! Always here to assist.')).toBeInTheDocument();
    });
  });

  it('filters reviews when clicking star rating button', async () => {
    render(
      <AuthProvider>
        <ProviderReviewsHub />
      </AuthProvider>
    );

    await screen.findByText('Customer Reviews Hub');

    const fiveStarBtn = screen.getByRole('button', { name: /5★/ });
    fireEvent.click(fiveStarBtn);

    await waitFor(() => {
      expect(providerService.fetchProviderReviews).toHaveBeenCalledWith(
        'valid-provider-jwt',
        expect.objectContaining({ rating: 5 })
      );
    });
  });
});

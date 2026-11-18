import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProviderProfileModal } from '../ProviderProfileModal';
import { PublicProviderData } from '@dwellio/shared';
import * as reviewService from '../../../services/reviewService';

vi.mock('../../../services/reviewService', () => ({
  fetchProviderReviews: vi.fn(),
}));

const mockProvider: PublicProviderData = {
  id: 'pro-42',
  userId: 'user-42',
  displayName: 'Karthik Raja',
  phone: '9840122334',
  serviceArea: 'Central Metro',
  skills: ['Waterproofing', 'Terrace Leak Repair'],
  verificationStatus: 'approved',
  ratingAverage: 4.9,
  reviewCount: 3,
  createdAt: '2026-10-19T00:00:00.000Z',
};

describe('ProviderProfileModal Component', () => {
  const mockClose = vi.fn();
  const mockBook = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders provider credentials, admin clearance notice, and indicative pricing without unbacked claims', async () => {
    vi.mocked(reviewService.fetchProviderReviews).mockResolvedValue({
      reviews: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      summary: { ratingAverage: 4.9, reviewCount: 3 },
    });

    render(
      <ProviderProfileModal
        isOpen={true}
        provider={mockProvider}
        onClose={mockClose}
        onBook={mockBook}
      />
    );

    expect(screen.getByRole('heading', { name: 'Karthik Raja' })).toBeInTheDocument();
    expect(screen.getAllByText(/dwellio admin verified specialist/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/4\.9/)).toBeInTheDocument();
    expect(screen.getByText(/serving central metro/i)).toBeInTheDocument();
    expect(screen.getByText('Waterproofing')).toBeInTheDocument();
    expect(screen.getByText('Terrace Leak Repair')).toBeInTheDocument();

    // Verify unbacked individual check claims are completely absent
    expect(screen.queryByText(/Gov ID/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Trade Skills/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/4 of 4/i)).not.toBeInTheDocument();

    // Verify indicative pricing text without fee crediting
    expect(screen.getByText(/indicative diagnostic visit from/i)).toBeInTheDocument();
    expect(screen.queryByText(/credited if service is performed/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/no verified reviews yet/i)).toBeInTheDocument();
    });
  });

  it('does not display admin verified badge for pending or rejected providers', async () => {
    vi.mocked(reviewService.fetchProviderReviews).mockResolvedValue({
      reviews: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      summary: { ratingAverage: 0, reviewCount: 0 },
    });

    const pendingProvider: PublicProviderData = {
      ...mockProvider,
      id: 'pro-pending',
      verificationStatus: 'pending',
    };

    render(
      <ProviderProfileModal
        isOpen={true}
        provider={pendingProvider}
        onClose={mockClose}
        onBook={mockBook}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/pending administrative review/i)).toBeInTheDocument();
      expect(screen.getByText(/no verified reviews yet/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/dwellio admin verified specialist/i)).not.toBeInTheDocument();
  });

  it('fetches and renders verified customer reviews with provider replies', async () => {
    vi.mocked(reviewService.fetchProviderReviews).mockResolvedValue({
      reviews: [
        {
          id: 'rev-1',
          bookingId: 'book-1',
          customerName: 'Pooja S.',
          serviceName: 'Terrace Waterproofing',
          rating: 5,
          comment: 'Karthik solved a persistent terrace leak during heavy monsoon rains. Super clean work!',
          providerReply: {
            replyText: 'Thank you Pooja! Happy to protect your home from roof leaks.',
            repliedAt: '2026-10-21T10:00:00.000Z',
          },
          createdAt: '2026-10-20T09:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      summary: { ratingAverage: 5, reviewCount: 1 },
    });

    render(
      <ProviderProfileModal
        isOpen={true}
        provider={mockProvider}
        onClose={mockClose}
        onBook={mockBook}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Pooja S.')).toBeInTheDocument();
      expect(screen.getByText(/persistent terrace leak/i)).toBeInTheDocument();
      expect(screen.getByText(/response from karthik raja/i)).toBeInTheDocument();
      expect(screen.getByText(/happy to protect your home/i)).toBeInTheDocument();
    });
  });

  it('triggers onBook with provider details when Book button is clicked', async () => {
    vi.mocked(reviewService.fetchProviderReviews).mockResolvedValue({
      reviews: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      summary: { ratingAverage: 4.9, reviewCount: 0 },
    });

    render(
      <ProviderProfileModal
        isOpen={true}
        provider={mockProvider}
        onClose={mockClose}
        onBook={mockBook}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/no verified reviews yet/i)).toBeInTheDocument();
    });

    const bookBtn = screen.getByRole('button', { name: /book karthik raja/i });
    fireEvent.click(bookBtn);

    expect(mockBook).toHaveBeenCalledWith(mockProvider);
  });

  it('triggers onClose when Close or X button is clicked', async () => {
    vi.mocked(reviewService.fetchProviderReviews).mockResolvedValue({
      reviews: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      summary: { ratingAverage: 4.9, reviewCount: 0 },
    });

    render(
      <ProviderProfileModal
        isOpen={true}
        provider={mockProvider}
        onClose={mockClose}
        onBook={mockBook}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/no verified reviews yet/i)).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole('button', { name: /^close$/i });
    fireEvent.click(closeBtn);
    expect(mockClose).toHaveBeenCalledTimes(1);

    const xBtn = screen.getByRole('button', { name: /close dialog/i });
    fireEvent.click(xBtn);
    expect(mockClose).toHaveBeenCalledTimes(2);
  });
});

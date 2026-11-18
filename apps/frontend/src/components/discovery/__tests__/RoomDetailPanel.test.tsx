import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RoomDetailPanel } from '../RoomDetailPanel';
import { AuthProvider } from '../../../context/AuthContext';
import { PublicProviderData, CategoryData, ServiceData } from '@dwellio/shared';

const mockCategory: CategoryData = {
  id: 'cat-1',
  name: 'Electrical Repairs',
  slug: 'electrical-repairs',
  rooms: ['living'],
  isActive: true,
  createdAt: '2026-10-19T00:00:00.000Z',
  updatedAt: '2026-10-19T00:00:00.000Z',
};

const mockServices: ServiceData[] = [
  {
    id: 'srv-1',
    categoryId: 'cat-1',
    name: 'Wiring & Short Circuit',
    slug: 'wiring-short-circuit',
    isActive: true,
    createdAt: '2026-10-19T00:00:00.000Z',
    updatedAt: '2026-10-19T00:00:00.000Z',
  },
  {
    id: 'srv-2',
    categoryId: 'cat-1',
    name: 'Ceiling Fan Installation',
    slug: 'ceiling-fan-installation',
    isActive: true,
    createdAt: '2026-10-19T00:00:00.000Z',
    updatedAt: '2026-10-19T00:00:00.000Z',
  },
];

const mockProviders: PublicProviderData[] = [
  {
    id: 'pro-1',
    userId: 'user-1',
    displayName: 'Naveen Kumar',
    phone: '9876543210',
    serviceArea: 'Central Metro',
    skills: ['Electrician', 'AC Service'],
    verificationStatus: 'approved',
    ratingAverage: 4.8,
    reviewCount: 12,
    createdAt: '2026-10-19T00:00:00.000Z',
  },
];

describe('RoomDetailPanel Component', () => {
  it('renders room title, description, and available service chips', () => {
    render(
      <AuthProvider>
        <RoomDetailPanel
          selectedRoom="living"
          categories={[mockCategory]}
          services={mockServices}
          providers={mockProviders}
          isLoading={false}
          error={null}
          onRetry={vi.fn()}
        />
      </AuthProvider>
    );

    expect(screen.getByText('Living Room & Electrical')).toBeInTheDocument();
    expect(screen.getByText('Wiring & Short Circuit')).toBeInTheDocument();
    expect(screen.getByText('Ceiling Fan Installation')).toBeInTheDocument();
  });

  it('renders loading state when isLoading is true', () => {
    render(
      <AuthProvider>
        <RoomDetailPanel
          selectedRoom="living"
          categories={[]}
          services={[]}
          providers={[]}
          isLoading={true}
          error={null}
          onRetry={vi.fn()}
        />
      </AuthProvider>
    );

    expect(screen.getByText(/approved professionals/i)).toHaveTextContent('Approved Professionals (...)');
  });

  it('renders error banner and retry button on network error', () => {
    const onRetry = vi.fn();
    render(
      <AuthProvider>
        <RoomDetailPanel
          selectedRoom="living"
          categories={[]}
          services={[]}
          providers={[]}
          isLoading={false}
          error="Network timeout reaching catalog service"
          onRetry={onRetry}
        />
      </AuthProvider>
    );

    expect(screen.getByText('Failed to load verified professionals')).toBeInTheDocument();
    expect(screen.getByText('Network timeout reaching catalog service')).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: /retry connection/i });
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders empty state message when no providers exist for the room', () => {
    render(
      <AuthProvider>
        <RoomDetailPanel
          selectedRoom="roof"
          categories={[]}
          services={[]}
          providers={[]}
          isLoading={false}
          error={null}
          onRetry={vi.fn()}
        />
      </AuthProvider>
    );

    expect(
      screen.getByText('No approved professionals found for this room yet')
    ).toBeInTheDocument();
  });

  it('renders provider card with verification status and triggers BookingModal on Book', () => {
    render(
      <AuthProvider>
        <RoomDetailPanel
          selectedRoom="living"
          categories={[mockCategory]}
          services={mockServices}
          providers={mockProviders}
          isLoading={false}
          error={null}
          onRetry={vi.fn()}
        />
      </AuthProvider>
    );

    expect(screen.getByText('Naveen Kumar')).toBeInTheDocument();
    expect(screen.getAllByText(/dwellio admin verified specialist/i)[0]).toBeInTheDocument();
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('(12 reviews)')).toBeInTheDocument();
    expect(screen.getByText(/serving central metro/i)).toBeInTheDocument();
    expect(screen.queryByText(/4 of 4 checks/i)).not.toBeInTheDocument();

    // Click Book
    const bookButton = screen.getByRole('button', { name: 'Book' });
    fireEvent.click(bookButton);

    // Should open real interactive BookingModal
    expect(screen.getByRole('heading', { name: /book naveen kumar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & request booking/i })).toBeInTheDocument();

    // Dismiss modal
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);
    expect(screen.queryByRole('heading', { name: /book naveen kumar/i })).not.toBeInTheDocument();
  });

  it('renders transparent pricing notice and opens ProviderProfileModal when clicking Reviews button', () => {
    render(
      <AuthProvider>
        <RoomDetailPanel
          selectedRoom="living"
          categories={[mockCategory]}
          services={mockServices}
          providers={mockProviders}
          isLoading={false}
          error={null}
          onRetry={vi.fn()}
        />
      </AuthProvider>
    );

    // Verify pricing notice
    expect(screen.getByText(/transparent pricing:/i)).toBeInTheDocument();
    expect(screen.getByText(/indicative diagnostic visit from/i)).toBeInTheDocument();
    expect(screen.getByText(/₹499/)).toBeInTheDocument();
    expect(screen.queryByText(/credited if service is performed/i)).not.toBeInTheDocument();

    // Click Reviews button
    const reviewsBtn = screen.getByRole('button', { name: /reviews \(12\)/i });
    expect(reviewsBtn).toBeInTheDocument();
    fireEvent.click(reviewsBtn);

    // Verify ProviderProfileModal opens
    expect(screen.getByRole('heading', { name: 'Naveen Kumar' })).toBeInTheDocument();
    expect(screen.getByText(/verified customer reviews/i)).toBeInTheDocument();
  });

  it('does not display admin verified badge for pending or rejected providers', () => {
    const unverifiedProviders: PublicProviderData[] = [
      {
        ...mockProviders[0],
        id: 'pro-unverified',
        verificationStatus: 'pending',
      },
    ];

    render(
      <AuthProvider>
        <RoomDetailPanel
          selectedRoom="living"
          categories={[mockCategory]}
          services={mockServices}
          providers={unverifiedProviders}
          isLoading={false}
          error={null}
          onRetry={vi.fn()}
        />
      </AuthProvider>
    );

    expect(screen.getByText('Pending Verification')).toBeInTheDocument();
    expect(screen.queryByText(/dwellio admin verified specialist/i)).not.toBeInTheDocument();
  });
});

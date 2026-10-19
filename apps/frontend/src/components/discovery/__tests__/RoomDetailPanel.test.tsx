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
    expect(screen.getByText(/fully verified/i)).toBeInTheDocument();
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('(12 reviews)')).toBeInTheDocument();
    expect(screen.getByText(/serving central metro/i)).toBeInTheDocument();

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
});

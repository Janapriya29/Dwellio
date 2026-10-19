import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ServiceDiscoveryPage } from '../ServiceDiscoveryPage';
import * as catalogService from '../../services/catalogService';

vi.mock('../../services/catalogService', () => ({
  fetchCategories: vi.fn(),
  fetchServices: vi.fn(),
  fetchApprovedProviders: vi.fn(),
}));

describe('ServiceDiscoveryPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders header, brand tagline, and initial living room state', async () => {
    vi.mocked(catalogService.fetchCategories).mockResolvedValue([
      {
        id: 'cat-living',
        name: 'Electrician & Lighting',
        slug: 'electrician-lighting',
        rooms: ['living'],
        isActive: true,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      },
    ]);
    vi.mocked(catalogService.fetchServices).mockResolvedValue([
      {
        id: 'srv-1',
        categoryId: 'cat-living',
        name: 'AC Servicing',
        slug: 'ac-servicing',
        isActive: true,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      },
    ]);
    vi.mocked(catalogService.fetchApprovedProviders).mockResolvedValue([
      {
        id: 'pro-1',
        userId: 'user-1',
        displayName: 'Naveen Kumar',
        phone: '9876543210',
        serviceArea: 'East Zone',
        skills: ['Electrician', 'AC Service'],
        verificationStatus: 'approved',
        createdAt: '2026-10-19T00:00:00.000Z',
      },
    ]);

    render(<ServiceDiscoveryPage />);

    expect(screen.getByText('Dwellio')).toBeInTheDocument();
    expect(screen.getByText('Your Home, in Good Hands.')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /pick a room\. see who's verified to fix it\./i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Living Room & Electrical')).toBeInTheDocument();
      expect(screen.getByText('Naveen Kumar')).toBeInTheDocument();
    });
  });

  it('switches rooms when a room pill is clicked', async () => {
    vi.mocked(catalogService.fetchCategories).mockResolvedValue([]);
    vi.mocked(catalogService.fetchServices).mockResolvedValue([]);
    vi.mocked(catalogService.fetchApprovedProviders).mockResolvedValue([
      {
        id: 'pro-bath',
        userId: 'user-2',
        displayName: 'Selvi Murugan',
        phone: '9876543211',
        serviceArea: 'West Zone',
        skills: ['Plumbing', 'Tiling'],
        verificationStatus: 'approved',
        createdAt: '2026-10-19T00:00:00.000Z',
      },
    ]);

    render(<ServiceDiscoveryPage />);

    // Click on Bathroom pill
    const [bathPill] = screen.getAllByRole('button', { name: 'Bathroom' });
    fireEvent.click(bathPill);

    await waitFor(() => {
      expect(catalogService.fetchApprovedProviders).toHaveBeenCalledWith('bath');
      expect(screen.getByText('Bathroom & Plumbing')).toBeInTheDocument();
    });
  });
});

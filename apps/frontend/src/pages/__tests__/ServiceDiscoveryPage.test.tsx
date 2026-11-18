import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ServiceDiscoveryPage } from '../ServiceDiscoveryPage';
import { AuthProvider } from '../../context/AuthContext';
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

  it('renders hero title and initial living room state', async () => {
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

    render(
      <AuthProvider>
        <ServiceDiscoveryPage />
      </AuthProvider>
    );

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

    render(
      <AuthProvider>
        <ServiceDiscoveryPage />
      </AuthProvider>
    );

    // Click on Bathroom pill
    const [bathPill] = screen.getAllByRole('button', { name: 'Bathroom' });
    fireEvent.click(bathPill);

    await waitFor(() => {
      expect(catalogService.fetchApprovedProviders).toHaveBeenCalledWith('bath');
      expect(screen.getByText('Bathroom & Plumbing')).toBeInTheDocument();
    });
  });

  it('filters providers and services by keyword search input', async () => {
    vi.mocked(catalogService.fetchCategories).mockResolvedValue([]);
    vi.mocked(catalogService.fetchServices).mockResolvedValue([
      {
        id: 'srv-1',
        categoryId: 'cat-1',
        name: 'AC Tune Up',
        slug: 'ac-tune-up',
        isActive: true,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      },
      {
        id: 'srv-2',
        categoryId: 'cat-1',
        name: 'Wall Painting',
        slug: 'wall-painting',
        isActive: true,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      },
    ]);
    vi.mocked(catalogService.fetchApprovedProviders).mockResolvedValue([
      {
        id: 'pro-1',
        userId: 'user-1',
        displayName: 'Cool Air Pro',
        phone: '9840112233',
        serviceArea: 'Central Metro',
        skills: ['AC Service'],
        verificationStatus: 'approved',
        createdAt: '2026-10-19T00:00:00.000Z',
      },
      {
        id: 'pro-2',
        userId: 'user-2',
        displayName: 'Master Painter',
        phone: '9840998877',
        serviceArea: 'West Coast',
        skills: ['Painting'],
        verificationStatus: 'approved',
        createdAt: '2026-10-19T00:00:00.000Z',
      },
    ]);

    render(
      <AuthProvider>
        <ServiceDiscoveryPage />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Cool Air Pro')).toBeInTheDocument();
      expect(screen.getByText('Master Painter')).toBeInTheDocument();
    });

    // Type "AC" into search
    const searchInput = screen.getByLabelText(/search services and specialists/i);
    fireEvent.change(searchInput, { target: { value: 'AC' } });

    // "Cool Air Pro" should remain, "Master Painter" should be filtered out
    expect(screen.getByText('Cool Air Pro')).toBeInTheDocument();
    expect(screen.queryByText('Master Painter')).not.toBeInTheDocument();

    // Active filters summary
    expect(screen.getByText(/keyword: “ac”/i)).toBeInTheDocument();
    expect(screen.getByText(/1 matching provider/i)).toBeInTheDocument();

    // Click Clear Filters
    const clearBtn = screen.getByRole('button', { name: /clear filters/i });
    fireEvent.click(clearBtn);

    expect(screen.getByText('Cool Air Pro')).toBeInTheDocument();
    expect(screen.getByText('Master Painter')).toBeInTheDocument();
  });

  it('triggers fetchApprovedProviders with serviceArea when area dropdown changes', async () => {
    vi.mocked(catalogService.fetchCategories).mockResolvedValue([]);
    vi.mocked(catalogService.fetchServices).mockResolvedValue([]);
    vi.mocked(catalogService.fetchApprovedProviders).mockResolvedValue([]);

    render(
      <AuthProvider>
        <ServiceDiscoveryPage />
      </AuthProvider>
    );

    const areaSelect = screen.getByLabelText(/filter by service area/i);
    fireEvent.change(areaSelect, { target: { value: 'Central Metro' } });

    await waitFor(() => {
      expect(catalogService.fetchApprovedProviders).toHaveBeenCalledWith({
        room: 'living',
        serviceArea: 'Central Metro',
      });
    });
  });

  it('dynamically populates service area options from loaded provider dataset, including seed areas and handling duplicates and empty values', async () => {
    vi.mocked(catalogService.fetchCategories).mockResolvedValue([]);
    vi.mocked(catalogService.fetchServices).mockResolvedValue([]);
    vi.mocked(catalogService.fetchApprovedProviders).mockResolvedValue([
      {
        id: 'pro-seed-1',
        userId: 'user-1',
        displayName: 'Coastal Plumber',
        phone: '9840112233',
        serviceArea: 'All City Zones', // Seed value
        skills: ['Plumbing'],
        verificationStatus: 'approved',
        createdAt: '2026-10-19T00:00:00.000Z',
      },
      {
        id: 'pro-seed-2',
        userId: 'user-2',
        displayName: 'Metro Electrician',
        phone: '9840998877',
        serviceArea: 'Metro West & Downtown', // Seed value
        skills: ['Electrician'],
        verificationStatus: 'approved',
        createdAt: '2026-10-19T00:00:00.000Z',
      },
      {
        id: 'pro-dup',
        userId: 'user-3',
        displayName: 'Another Electrician',
        phone: '9840998866',
        serviceArea: 'All City Zones', // Duplicate
        skills: ['Electrician'],
        verificationStatus: 'approved',
        createdAt: '2026-10-19T00:00:00.000Z',
      },
      {
        id: 'pro-empty',
        userId: 'user-4',
        displayName: 'Blank Area Pro',
        phone: '9840998855',
        serviceArea: '   ', // Whitespace-only area
        skills: ['Painting'],
        verificationStatus: 'approved',
        createdAt: '2026-10-19T00:00:00.000Z',
      },
    ]);

    render(
      <AuthProvider>
        <ServiceDiscoveryPage />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Coastal Plumber')).toBeInTheDocument();
    });

    const areaSelect = screen.getByLabelText(/filter by service area/i) as HTMLSelectElement;
    const optionValues = Array.from(areaSelect.options).map((opt) => opt.value);

    // Verifies seed areas are dynamically present
    expect(optionValues).toContain('All City Zones');
    expect(optionValues).toContain('Metro West & Downtown');

    // Verifies standard default areas remain available
    expect(optionValues).toContain('Central Metro');
    expect(optionValues).toContain('North Suburbs');

    // Verifies duplicates are removed (All City Zones appears exactly once among options)
    const allCityZonesCount = optionValues.filter((v) => v === 'All City Zones').length;
    expect(allCityZonesCount).toBe(1);

    // Verifies whitespace-only area was omitted
    expect(optionValues).not.toContain('   ');
    const emptyValueOptions = Array.from(areaSelect.options).filter((opt) => opt.value === '');
    expect(emptyValueOptions.length).toBe(1);
    expect(emptyValueOptions[0].text).toBe('All Operating Areas');

    // Selecting dynamic seed area triggers fetch with exact value expected by backend
    fireEvent.change(areaSelect, { target: { value: 'Metro West & Downtown' } });
    await waitFor(() => {
      expect(catalogService.fetchApprovedProviders).toHaveBeenCalledWith({
        room: 'living',
        serviceArea: 'Metro West & Downtown',
      });
    });
  });
});

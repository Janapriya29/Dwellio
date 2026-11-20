import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProviderDashboardOverview } from '../ProviderDashboardOverview';
import { AuthProvider } from '../../../context/AuthContext';
import * as providerService from '../../../services/providerService';
import { ProviderDashboardStats } from '@dwellio/shared';

vi.mock('../../../services/providerService', () => ({
  fetchProviderDashboardStats: vi.fn(),
}));

const mockStats: ProviderDashboardStats = {
  totalCompletedJobs: 14,
  totalBookings: 20,
  pendingRequests: 3,
  activeJobs: 2,
  acceptanceRate: 92,
  completionRate: 95,
  ratingAverage: 4.9,
  reviewCount: 18,
  totalRecordedEarnings: 45000,
  currentMonthEarnings: 18500,
  todaysJobs: [
    {
      id: 'job-today-1',
      serviceId: 'srv-1',
      providerId: 'prov-1',
      providerUserId: 'usr-prov-1',
      customerId: 'cust-1',
      categoryId: 'cat-1',
      scheduledStartTime: '2026-11-20T10:00:00.000Z',
      scheduledEndTime: '2026-11-20T12:00:00.000Z',
      status: 'accepted',
      address: { street: 'Indiranagar 100ft Rd', city: 'Bangalore' },
      customer: { id: 'cust-1', name: 'Nikhil Verma', email: 'nikhil@example.com' },
      service: { id: 'srv-1', name: 'Roof Tile Sealing', slug: 'roof-sealing' },
      statusHistory: [],
      createdAt: '2026-11-19T10:00:00.000Z',
      updatedAt: '2026-11-19T10:00:00.000Z',
    },
  ],
};

describe('ProviderDashboardOverview Component', () => {
  const mockOnNavigateTab = vi.fn();

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
    vi.mocked(providerService.fetchProviderDashboardStats).mockResolvedValue(mockStats);
  });

  it('renders KPI metrics cards, earnings summary formatted in INR, and today agenda', async () => {
    render(
      <AuthProvider>
        <ProviderDashboardOverview onNavigateTab={mockOnNavigateTab} />
      </AuthProvider>
    );

    // Welcome greeting
    expect(await screen.findByText(/Welcome back, Karthik Raja!/i)).toBeInTheDocument();

    // Earnings
    expect(screen.getByText('₹18,500')).toBeInTheDocument();
    expect(screen.getByText('₹45,000')).toBeInTheDocument();

    // KPIs
    expect(screen.getByText('14')).toBeInTheDocument(); // completed
    expect(screen.getByText('2')).toBeInTheDocument(); // active
    expect(screen.getByText('3')).toBeInTheDocument(); // pending
    expect(screen.getByText('92%')).toBeInTheDocument(); // acceptance
    expect(screen.getByText('95%')).toBeInTheDocument(); // completion
    expect(screen.getByText('4.9')).toBeInTheDocument(); // rating

    // Today's Agenda
    expect(screen.getByText('Roof Tile Sealing')).toBeInTheDocument();
    expect(screen.getByText(/Nikhil Verma/)).toBeInTheDocument();
    expect(screen.getByText(/1 Today/)).toBeInTheDocument();
  });

  it('opens job details modal when clicking on an agenda job card', async () => {
    render(
      <AuthProvider>
        <ProviderDashboardOverview onNavigateTab={mockOnNavigateTab} />
      </AuthProvider>
    );

    const jobCardBtn = await screen.findByRole('button', { name: /view job & route/i });
    fireEvent.click(jobCardBtn);

    // Job Details Modal opened
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Roof Tile Sealing' }).length).toBeGreaterThanOrEqual(2);
  });

  it('renders friendly empty state when no appointments scheduled today', async () => {
    const emptyStats: ProviderDashboardStats = { ...mockStats, todaysJobs: [] };
    vi.mocked(providerService.fetchProviderDashboardStats).mockResolvedValue(emptyStats);

    render(
      <AuthProvider>
        <ProviderDashboardOverview onNavigateTab={mockOnNavigateTab} />
      </AuthProvider>
    );

    expect(await screen.findByText(/No Appointments Scheduled for Today/i)).toBeInTheDocument();
    expect(screen.getByText('0 Today')).toBeInTheDocument();
  });
});

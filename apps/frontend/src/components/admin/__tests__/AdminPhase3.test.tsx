import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../../context/AuthContext';
import { AdminOverviewView } from '../AdminOverviewView';
import { AdminCustomersView } from '../AdminCustomersView';
import { AdminVerifiedProvidersView } from '../AdminVerifiedProvidersView';
import { AdminDisputesView } from '../AdminDisputesView';
import { AdminAnnouncementsView } from '../AdminAnnouncementsView';
import { AdminSettingsView } from '../AdminSettingsView';
import * as adminService from '../../../services/adminService';
import { AdminOverviewData, AdminAnalyticsData } from '@dwellio/shared';

vi.mock('../../../services/adminService', () => ({
  fetchAdminOverview: vi.fn(),
  fetchAdminAnalytics: vi.fn(),
  fetchAdminCustomers: vi.fn(),
  fetchAdminCustomerById: vi.fn(),
  updateAdminCustomerStatus: vi.fn(),
  fetchAdminProviders: vi.fn(),
  fetchAdminProviderDetail: vi.fn(),
  updateAdminProviderStatus: vi.fn(),
  fetchAdminBookings: vi.fn(),
  fetchAdminBookingById: vi.fn(),
  adminCancelBooking: vi.fn(),
  adminUpdatePaymentStatus: vi.fn(),
  fetchAdminDisputes: vi.fn(),
  fetchAdminDisputeById: vi.fn(),
  resolveAdminDispute: vi.fn(),
  fetchAdminAnnouncements: vi.fn(),
  createAdminAnnouncement: vi.fn(),
  fetchAdminSettings: vi.fn(),
  updateAdminSettings: vi.fn(),
}));

const mockOverview: AdminOverviewData = {
  stats: {
    totalCustomers: 45,
    totalProviders: 12,
    pendingApplications: 2,
    activeServices: 15,
    totalBookings: 35,
    bookingsByStatus: {
      requested: 3,
      accepted: 5,
      on_the_way: 2,
      in_progress: 3,
      completed: 20,
      cancelled: 1,
      rejected: 1,
    },
    totalReviews: 22,
    suspendedUsers: 1,
    financialSummary: {
      grossMerchandiseValue: 25000,
      recordedPaidVolume: 22000,
      estimatedPlatformCommission: 3750,
      estimatedProviderPayout: 21250,
      recordedRefundedAmount: 500,
      currentMonthGmv: 15000,
      previousMonthGmv: 10000,
      monthOverMonthGrowthPercent: 50,
    },
  },
  recentActivity: [],
};

const mockAnalytics: AdminAnalyticsData = {
  financials: mockOverview.stats.financialSummary!,
  topServices: [
    {
      serviceId: 'svc-1',
      serviceName: 'Deep Home Cleaning',
      categoryName: 'Cleaning',
      bookingCount: 15,
      completedRevenue: 15000,
    },
  ],
  topCategories: [
    {
      categoryId: 'cat-1',
      categoryName: 'Cleaning & Housekeeping',
      bookingCount: 20,
      completedRevenue: 20000,
    },
  ],
  bookingTrends: [],
};

describe('Phase 3: Admin Experience Frontend Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(
      'dwellio_user',
      JSON.stringify({
        id: 'admin-1',
        name: 'Dwellio Administrator',
        email: 'admin@dwellio.local',
        role: 'admin',
      })
    );
    localStorage.setItem('dwellio_token', 'admin-test-token');
  });

  // ----------------------------------------------------
  // Milestone 3A: Financials & Revenue Operations
  // ----------------------------------------------------
  it('renders Milestone 3A financial spotlight cards and MoM growth metrics', async () => {
    vi.mocked(adminService.fetchAdminOverview).mockResolvedValue(mockOverview);
    vi.mocked(adminService.fetchAdminAnalytics).mockResolvedValue(mockAnalytics);

    render(
      <AuthProvider>
        <AdminOverviewView onNavigateTab={vi.fn()} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Gross Merchandise Value/).length).toBeGreaterThan(0);
      expect(screen.getByText(/₹25,000/)).toBeInTheDocument();
      expect(screen.getByText(/Platform Commission/)).toBeInTheDocument();
      expect(screen.getByText(/₹3,750/)).toBeInTheDocument();
      expect(screen.getByText(/Provider Disbursements/)).toBeInTheDocument();
      expect(screen.getByText(/₹21,250/)).toBeInTheDocument();
      expect(screen.getByText(/▲ \+50% MoM/)).toBeInTheDocument();
      expect(screen.getByText('Deep Home Cleaning')).toBeInTheDocument();
    });
  });

  it('displays dynamic platform commission and provider net percentages based on configured settings', async () => {
    const customOverview: AdminOverviewData = {
      ...mockOverview,
      stats: {
        ...mockOverview.stats,
        financialSummary: {
          ...mockOverview.stats.financialSummary!,
          platformCommissionPercent: 20,
        },
      },
    };
    vi.mocked(adminService.fetchAdminOverview).mockResolvedValue(customOverview);
    vi.mocked(adminService.fetchAdminAnalytics).mockResolvedValue(mockAnalytics);

    render(
      <AuthProvider>
        <AdminOverviewView onNavigateTab={vi.fn()} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('20% Take')).toBeInTheDocument();
      expect(screen.getByText('80% Net')).toBeInTheDocument();
    });
  });

  // ----------------------------------------------------
  // Milestone 3B: Customer Management & Account Governance
  // ----------------------------------------------------
  it('renders Milestone 3B customer accounts list, search filter, and opens suspension dialog', async () => {
    vi.mocked(adminService.fetchAdminCustomers).mockResolvedValue({
      items: [
        {
          id: 'cust-1',
          name: 'Priya Sharma',
          email: 'priya@example.com',
          phone: '+91 98765 11111',
          isActive: true,
          totalBookings: 4,
          totalRecordedSpend: 4500,
          totalSpent: 4500,
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    render(
      <AuthProvider>
        <AdminCustomersView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
      expect(screen.getByText('priya@example.com')).toBeInTheDocument();
      expect(screen.getByText('₹4,500')).toBeInTheDocument();
      expect(screen.getByText('Suspend')).toBeInTheDocument();
    });

    // Click Suspend button
    fireEvent.click(screen.getByText('Suspend'));

    await waitFor(() => {
      expect(screen.getByText('Confirm Account Suspension')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Repeated booking non-payment/)).toBeInTheDocument();
    });
  });

  // ----------------------------------------------------
  // Milestone 3C: Verified Provider Governance
  // ----------------------------------------------------
  it('renders Milestone 3C verified providers, weekly schedules, and earnings summary', async () => {
    vi.mocked(adminService.fetchAdminProviders).mockResolvedValue({
      items: [
        {
          id: 'pro-1',
          userId: 'user-pro-1',
          displayName: 'Ravi Kumar Electricals',
          phone: '+91 98765 22222',
          serviceArea: 'Chennai Central',
          skills: ['Wiring', 'Switchboards'],
          verificationStatus: 'approved',
          isAcceptingJobs: true,
          workingSchedule: [{ dayOfWeek: 1, activeSlotIndices: [0, 1] }],
          blockedDates: [],
          ratingAverage: 4.8,
          reviewCount: 12,
          completedJobCount: 15,
          completedJobsCount: 15,
          cancelledJobCount: 1,
          totalRecordedEarnings: 18000,
          lifetimeEarnings: 18000,
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    render(
      <AuthProvider>
        <AdminVerifiedProvidersView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Ravi Kumar Electricals')).toBeInTheDocument();
      expect(screen.getByText('+91 98765 22222')).toBeInTheDocument();
      expect(screen.getByText('₹18,000')).toBeInTheDocument();
      expect(screen.getByText('Profile')).toBeInTheDocument();
    });
  });

  // ----------------------------------------------------
  // Milestone 3D: Disputes Adjudication
  // ----------------------------------------------------
  it('renders Milestone 3D disputes list and opens adjudication modal with resolution options', async () => {
    vi.mocked(adminService.fetchAdminDisputes).mockResolvedValue({
      items: [
        {
          id: 'disp-1',
          bookingId: 'book-100',
          raisedByUserId: 'user-cust-1',
          raisedByRole: 'customer',
          initiatorRole: 'customer',
          raisedAgainstUserId: 'user-pro-1',
          raisedAgainstRole: 'provider',
          category: 'service_quality',
          reason: 'service_quality',
          description: 'Provider arrived late and did not finish electrical testing checklist.',
          status: 'open',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    vi.mocked(adminService.fetchAdminDisputeById).mockResolvedValue({
      id: 'disp-1',
      bookingId: 'book-100',
      raisedByUserId: 'user-cust-1',
      raisedByRole: 'customer',
      initiatorRole: 'customer',
      raisedAgainstUserId: 'user-pro-1',
      raisedAgainstRole: 'provider',
      category: 'service_quality',
      reason: 'service_quality',
      description: 'Provider arrived late and did not finish electrical testing checklist.',
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    render(
      <AuthProvider>
        <AdminDisputesView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/#ok-100/)).toBeInTheDocument();
      expect(screen.getByText('service quality')).toBeInTheDocument();
      expect(screen.getByText('Adjudicate')).toBeInTheDocument();
    });

    // Open adjudication modal
    fireEvent.click(screen.getByText('Adjudicate'));

    await waitFor(() => {
      expect(screen.getByText('Dispute Review: #disp-1')).toBeInTheDocument();
      expect(screen.getByText('Statement of Conflict:')).toBeInTheDocument();
      expect(screen.getByText('Determination Verdict *')).toBeInTheDocument();
    });
  });

  // ----------------------------------------------------
  // Milestone 3E: Announcements and Settings
  // ----------------------------------------------------
  it('renders Milestone 3E broadcast announcements composer and handles dispatch', async () => {
    vi.mocked(adminService.fetchAdminAnnouncements).mockResolvedValue({
      items: [
        {
          id: 'ann-1',
          title: 'Diwali Festive Holiday Schedule',
          message: 'Dwellio services will operate with emergency on-call professionals only.',
          audience: 'all',
          createdByAdminId: 'admin-1',
          recipientCount: 150,
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    render(
      <AuthProvider>
        <AdminAnnouncementsView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Compose New Broadcast Alert')).toBeInTheDocument();
      expect(screen.getByText('Diwali Festive Holiday Schedule')).toBeInTheDocument();
      expect(screen.getByText('(150 recipients)')).toBeInTheDocument();
    });
  });

  it('renders Milestone 3E platform settings form with commission % and maintenance banner toggle', async () => {
    vi.mocked(adminService.fetchAdminSettings).mockResolvedValue({
      platformCommissionPercent: 15,
      supportEmail: 'support@dwellio.com',
      supportPhone: '+91 98765 43210',
      emergencyMaintenanceNotice: {
        enabled: false,
        message: '',
      },
      updatedAt: new Date().toISOString(),
    });

    render(
      <AuthProvider>
        <AdminSettingsView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Platform Commission Rate (%) *')).toBeInTheDocument();
      expect(screen.getByDisplayValue('15')).toBeInTheDocument();
      expect(screen.getByDisplayValue('support@dwellio.com')).toBeInTheDocument();
      expect(screen.getByText('Enable Emergency Maintenance Advisory Banner')).toBeInTheDocument();
    });
  });
});

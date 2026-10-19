import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminDashboardLayout } from '../AdminDashboardLayout';
import { AuthProvider } from '../../../context/AuthContext';
import * as adminService from '../../../services/adminService';
import {
  AdminOverviewData,
  CategoryData,
  ServiceData,
  AdminBookingItem,
  BookingData,
  AdminReviewItem,
  AuditLogData,
} from '@dwellio/shared';

vi.mock('../../../services/adminService', () => ({
  fetchAdminOverview: vi.fn(),
  fetchAdminApplications: vi.fn(),
  approveAdminApplication: vi.fn(),
  rejectAdminApplication: vi.fn(),
  fetchAdminCategories: vi.fn(),
  createAdminCategory: vi.fn(),
  updateAdminCategory: vi.fn(),
  setAdminCategoryStatus: vi.fn(),
  fetchAdminServices: vi.fn(),
  createAdminService: vi.fn(),
  updateAdminService: vi.fn(),
  setAdminServiceStatus: vi.fn(),
  fetchAdminBookings: vi.fn(),
  fetchAdminBookingById: vi.fn(),
  fetchAdminReviews: vi.fn(),
  moderateAdminReview: vi.fn(),
  fetchAdminAuditLogs: vi.fn(),
}));

const mockOverview: AdminOverviewData = {
  stats: {
    totalCustomers: 42,
    totalProviders: 8,
    pendingApplications: 2,
    activeServices: 14,
    totalBookings: 25,
    bookingsByStatus: {
      requested: 3,
      accepted: 5,
      on_the_way: 1,
      in_progress: 2,
      completed: 12,
      cancelled: 1,
      rejected: 1,
    },
    totalReviews: 18,
  },
  recentActivity: [
    {
      id: 'log-001',
      adminId: 'admin-1',
      adminName: 'Dwellio Admin',
      action: 'PROVIDER_APPLICATION_APPROVED',
      targetId: 'pro-app-1',
      targetType: 'ProviderProfile',
      createdAt: '2026-10-19T10:00:00.000Z',
    },
  ],
};

const mockApplications: adminService.AdminProviderApplicationItem[] = [
  {
    id: 'app-001',
    userId: 'user-001',
    displayName: 'Vijay Kumar Services',
    phone: '9840112233',
    serviceArea: 'South Zone',
    skills: ['Plumbing', 'Solar'],
    verificationStatus: 'pending',
    createdAt: '2026-10-19T08:00:00.000Z',
    updatedAt: '2026-10-19T08:00:00.000Z',
    user: {
      id: 'user-001',
      name: 'Vijay Kumar',
      email: 'vijay@example.com',
      role: 'customer',
      isActive: true,
    },
  },
];

const mockCategories: CategoryData[] = [
  {
    id: 'cat-001',
    name: 'Electrical & Lighting',
    slug: 'electrical-lighting',
    description: 'Home wiring and switches',
    icon: '⚡',
    rooms: ['living', 'kitchen'],
    isActive: true,
    createdAt: '2026-10-19T08:00:00.000Z',
    updatedAt: '2026-10-19T08:00:00.000Z',
  },
];

const mockServices: ServiceData[] = [
  {
    id: 'svc-001',
    categoryId: 'cat-001',
    name: 'Switchboard Repair',
    slug: 'switchboard-repair',
    description: 'Fix loose switches and sockets',
    icon: '🔌',
    isActive: true,
    createdAt: '2026-10-19T08:00:00.000Z',
    updatedAt: '2026-10-19T08:00:00.000Z',
  },
];

const mockBookings: AdminBookingItem[] = [
  {
    id: 'book-001',
    serviceName: 'Switchboard Repair',
    customerName: 'Pooja Sharma',
    customerEmail: 'pooja@example.com',
    providerDisplayName: 'Karthik Raja',
    providerPhone: '9840122334',
    scheduledStartTime: '2026-10-21T09:00:00.000Z',
    scheduledEndTime: '2026-10-21T11:00:00.000Z',
    status: 'accepted',
    createdAt: '2026-10-19T08:00:00.000Z',
  },
];

const mockBookingDetails: BookingData = {
  id: 'book-001',
  customerId: 'cust-1',
  customer: { id: 'cust-1', name: 'Pooja Sharma', email: 'pooja@example.com' },
  providerId: 'pro-1',
  providerUserId: 'pro-user-1',
  provider: {
    id: 'pro-1',
    displayName: 'Karthik Raja',
    phone: '9840122334',
    serviceArea: 'Central Metro',
    skills: ['Electrician'],
  },
  serviceId: 'svc-001',
  service: { id: 'svc-001', name: 'Switchboard Repair', slug: 'switchboard-repair' },
  categoryId: 'cat-001',
  scheduledStartTime: '2026-10-21T09:00:00.000Z',
  scheduledEndTime: '2026-10-21T11:00:00.000Z',
  address: { street: '12 Palm Grove', city: 'Metro' },
  status: 'accepted',
  statusHistory: [
    {
      actorId: 'cust-1',
      actorRole: 'customer',
      fromStatus: 'requested',
      toStatus: 'requested',
      timestamp: '2026-10-19T08:00:00.000Z',
      reason: 'Initial booking',
    },
    {
      actorId: 'pro-user-1',
      actorRole: 'provider',
      fromStatus: 'requested',
      toStatus: 'accepted',
      timestamp: '2026-10-19T08:30:00.000Z',
      reason: 'Confirmed slot availability',
    },
  ],
  createdAt: '2026-10-19T08:00:00.000Z',
  updatedAt: '2026-10-19T08:30:00.000Z',
};

const mockReviews: AdminReviewItem[] = [
  {
    id: 'rev-001',
    bookingId: 'book-001',
    customerName: 'Pooja Sharma',
    providerDisplayName: 'Karthik Raja',
    serviceName: 'Switchboard Repair',
    rating: 5,
    comment: 'Punctual and professional work!',
    isPublished: true,
    createdAt: '2026-10-19T09:00:00.000Z',
  },
];

const mockAuditLogs: AuditLogData[] = [
  {
    id: 'log-001',
    adminId: 'admin-1',
    adminName: 'Dwellio Admin',
    adminEmail: 'admin@dwellio.local',
    action: 'PROVIDER_APPLICATION_APPROVED',
    targetId: 'app-001',
    targetType: 'ProviderProfile',
    details: { targetUserId: 'user-001' },
    createdAt: '2026-10-19T10:00:00.000Z',
  },
];

describe('Admin Dashboard Frontend Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders Access Denied guard when user is not an administrator', async () => {
    localStorage.setItem(
      'dwellio_user',
      JSON.stringify({
        id: 'cust-1',
        name: 'Pooja Sharma',
        email: 'customer@example.com',
        role: 'customer',
        isActive: true,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      })
    );
    localStorage.setItem('dwellio_token', 'cust-token');

    render(
      <AuthProvider>
        <AdminDashboardLayout />
      </AuthProvider>
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(
      screen.getByText(/Administrator privileges are required to access platform oversight/)
    ).toBeInTheDocument();
  });

  it('renders Admin Dashboard with metrics and sub-tabs for admin user', async () => {
    localStorage.setItem(
      'dwellio_user',
      JSON.stringify({
        id: 'admin-1',
        name: 'Dwellio Administrator',
        email: 'admin@dwellio.local',
        role: 'admin',
        isActive: true,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      })
    );
    localStorage.setItem('dwellio_token', 'admin-token');

    vi.mocked(adminService.fetchAdminOverview).mockResolvedValue(mockOverview);

    render(
      <AuthProvider>
        <AdminDashboardLayout />
      </AuthProvider>
    );

    // Header banner
    expect(screen.getByText('Platform Management & Oversight')).toBeInTheDocument();
    expect(screen.getByText('Admin Portal')).toBeInTheDocument();

    // Sub-tab pills
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Applications')).toBeInTheDocument();
    expect(screen.getByText('Catalog')).toBeInTheDocument();
    expect(screen.getByText('Bookings')).toBeInTheDocument();
    expect(screen.getByText('Reviews')).toBeInTheDocument();
    expect(screen.getByText('Audit Trail')).toBeInTheDocument();

    // Verify overview metric cards
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument(); // customers
      expect(screen.getByText('8')).toBeInTheDocument(); // providers
      expect(screen.getByText('14')).toBeInTheDocument(); // active services
      expect(screen.getByText('25')).toBeInTheDocument(); // total bookings
    });
  });

  it('allows approving and rejecting provider applications', async () => {
    localStorage.setItem(
      'dwellio_user',
      JSON.stringify({
        id: 'admin-1',
        name: 'Dwellio Administrator',
        email: 'admin@dwellio.local',
        role: 'admin',
        isActive: true,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      })
    );
    localStorage.setItem('dwellio_token', 'admin-token');

    vi.mocked(adminService.fetchAdminOverview).mockResolvedValue(mockOverview);
    vi.mocked(adminService.fetchAdminApplications).mockResolvedValue({
      items: mockApplications,
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    vi.mocked(adminService.approveAdminApplication).mockResolvedValue({
      ...mockApplications[0],
      verificationStatus: 'approved',
    });

    render(
      <AuthProvider>
        <AdminDashboardLayout />
      </AuthProvider>
    );

    // Switch to Applications tab
    const appsTab = screen.getByText('Applications');
    fireEvent.click(appsTab);

    await waitFor(() => {
      expect(screen.getByText('Vijay Kumar Services')).toBeInTheDocument();
      expect(screen.getByText('Plumbing')).toBeInTheDocument();
      expect(screen.getByText('Approve')).toBeInTheDocument();
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });

    // Click Approve button to open confirmation modal
    fireEvent.click(screen.getByText('Approve'));
    expect(screen.getByText('Confirm Approval')).toBeInTheDocument();

    // Confirm approval
    fireEvent.click(screen.getByText('Confirm Approval'));

    await waitFor(() => {
      expect(adminService.approveAdminApplication).toHaveBeenCalledWith('admin-token', 'app-001');
    });
  });

  it('allows catalog inspection and status toggling', async () => {
    localStorage.setItem(
      'dwellio_user',
      JSON.stringify({
        id: 'admin-1',
        name: 'Dwellio Administrator',
        email: 'admin@dwellio.local',
        role: 'admin',
        isActive: true,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      })
    );
    localStorage.setItem('dwellio_token', 'admin-token');

    vi.mocked(adminService.fetchAdminOverview).mockResolvedValue(mockOverview);
    vi.mocked(adminService.fetchAdminCategories).mockResolvedValue(mockCategories);
    vi.mocked(adminService.fetchAdminServices).mockResolvedValue(mockServices);
    vi.mocked(adminService.setAdminCategoryStatus).mockResolvedValue({
      ...mockCategories[0],
      isActive: false,
    });

    render(
      <AuthProvider>
        <AdminDashboardLayout />
      </AuthProvider>
    );

    // Click Catalog tab
    fireEvent.click(screen.getByText('Catalog'));

    await waitFor(() => {
      expect(screen.getByText('Electrical & Lighting')).toBeInTheDocument();
      expect(screen.getByText('Deactivate')).toBeInTheDocument();
    });

    // Toggle category status
    fireEvent.click(screen.getByText('Deactivate'));

    await waitFor(() => {
      expect(adminService.setAdminCategoryStatus).toHaveBeenCalledWith(
        'admin-token',
        'cat-001',
        false
      );
    });
  });

  it('allows booking inspection and viewing lifecycle status audit history', async () => {
    localStorage.setItem(
      'dwellio_user',
      JSON.stringify({
        id: 'admin-1',
        name: 'Dwellio Administrator',
        email: 'admin@dwellio.local',
        role: 'admin',
        isActive: true,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      })
    );
    localStorage.setItem('dwellio_token', 'admin-token');

    vi.mocked(adminService.fetchAdminOverview).mockResolvedValue(mockOverview);
    vi.mocked(adminService.fetchAdminBookings).mockResolvedValue({
      items: mockBookings,
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    vi.mocked(adminService.fetchAdminBookingById).mockResolvedValue(mockBookingDetails);

    render(
      <AuthProvider>
        <AdminDashboardLayout />
      </AuthProvider>
    );

    // Click Bookings tab
    fireEvent.click(screen.getByText('Bookings'));

    await waitFor(() => {
      expect(screen.getByText('Switchboard Repair')).toBeInTheDocument();
      expect(screen.getByText('Inspect')).toBeInTheDocument();
    });

    // Inspect booking details
    fireEvent.click(screen.getByText('Inspect'));

    await waitFor(() => {
      expect(screen.getByText(/Booking Inspection:/)).toBeInTheDocument();
      expect(screen.getByText('Status Transition Audit Trail')).toBeInTheDocument();
      expect(screen.getByText('Confirmed slot availability')).toBeInTheDocument();
      expect(screen.getByText(/Platform Oversight Mode:/)).toBeInTheDocument();
    });
  });

  it('allows review moderation (hiding with reason and recalculation notification)', async () => {
    localStorage.setItem(
      'dwellio_user',
      JSON.stringify({
        id: 'admin-1',
        name: 'Dwellio Administrator',
        email: 'admin@dwellio.local',
        role: 'admin',
        isActive: true,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      })
    );
    localStorage.setItem('dwellio_token', 'admin-token');

    vi.mocked(adminService.fetchAdminOverview).mockResolvedValue(mockOverview);
    vi.mocked(adminService.fetchAdminReviews).mockResolvedValue({
      items: mockReviews,
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    vi.mocked(adminService.moderateAdminReview).mockResolvedValue({
      ...mockReviews[0],
      isPublished: false,
      moderationReason: 'Inappropriate language detected.',
    });

    render(
      <AuthProvider>
        <AdminDashboardLayout />
      </AuthProvider>
    );

    // Click Reviews tab
    fireEvent.click(screen.getByText('Reviews'));

    await waitFor(() => {
      expect(screen.getByText('Punctual and professional work!')).toBeInTheDocument();
      expect(screen.getByText('Hide Review')).toBeInTheDocument();
    });

    // Click Hide Review
    fireEvent.click(screen.getByText('Hide Review'));

    expect(screen.getByText(/Hiding this review will remove it from public view/)).toBeInTheDocument();

    // Fill in moderation reason
    const textarea = screen.getByPlaceholderText(/e.g., Inappropriate content/);
    fireEvent.change(textarea, { target: { value: 'Inappropriate language detected.' } });

    // Confirm hide
    fireEvent.click(screen.getByText('Confirm Hide'));

    await waitFor(() => {
      expect(adminService.moderateAdminReview).toHaveBeenCalledWith('admin-token', 'rev-001', {
        isPublished: false,
        moderationReason: 'Inappropriate language detected.',
      });
    });
  });

  it('renders immutable audit logs and filter options', async () => {
    localStorage.setItem(
      'dwellio_user',
      JSON.stringify({
        id: 'admin-1',
        name: 'Dwellio Administrator',
        email: 'admin@dwellio.local',
        role: 'admin',
        isActive: true,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      })
    );
    localStorage.setItem('dwellio_token', 'admin-token');

    vi.mocked(adminService.fetchAdminOverview).mockResolvedValue(mockOverview);
    vi.mocked(adminService.fetchAdminAuditLogs).mockResolvedValue({
      items: mockAuditLogs,
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    render(
      <AuthProvider>
        <AdminDashboardLayout />
      </AuthProvider>
    );

    // Click Audit Trail tab
    fireEvent.click(screen.getByText('Audit Trail'));

    await waitFor(() => {
      expect(screen.getByText('Immutable Platform Audit Logs')).toBeInTheDocument();
      expect(screen.getByText('PROVIDER_APPLICATION_APPROVED')).toBeInTheDocument();
      expect(screen.getAllByText('admin@dwellio.local').length).toBeGreaterThanOrEqual(1);
    });
  });
});

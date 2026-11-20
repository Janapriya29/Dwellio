import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ProviderPortalView } from '../ProviderPortalView';
import { AuthProvider } from '../../../context/AuthContext';
import * as providerService from '../../../services/providerService';
import * as bookingService from '../../../services/bookingService';
import { ProviderProfileData } from '@dwellio/shared';

vi.mock('../../../services/providerService', () => ({
  fetchProviderApplicationStatus: vi.fn(),
  submitProviderApplication: vi.fn(),
  fetchProviderDashboardStats: vi.fn().mockResolvedValue({
    totalCompletedJobs: 5,
    totalBookings: 8,
    pendingRequests: 1,
    activeJobs: 2,
    acceptanceRate: 90,
    completionRate: 95,
    ratingAverage: 4.8,
    reviewCount: 6,
    totalRecordedEarnings: 15000,
    currentMonthEarnings: 8000,
    todaysJobs: [],
  }),
}));

vi.mock('../../../services/bookingService', () => ({
  fetchProviderBookings: vi.fn(),
  acceptProviderBooking: vi.fn(),
  rejectProviderBooking: vi.fn(),
  updateProviderBookingStatus: vi.fn(),
}));

const mockPendingProfile: ProviderProfileData = {
  id: 'app-pending-01',
  userId: 'user-01',
  displayName: 'Selvi Quality Plumbing',
  phone: '9840223344',
  serviceArea: 'West Coast District',
  skills: ['Plumbing', 'Tiling'],
  verificationStatus: 'pending',
  createdAt: '2026-10-19T08:00:00.000Z',
  updatedAt: '2026-10-19T08:00:00.000Z',
};

const mockRejectedProfile: ProviderProfileData = {
  id: 'app-rejected-02',
  userId: 'user-02',
  displayName: 'Quick Fix Services',
  phone: '9840334455',
  serviceArea: 'East City Zone',
  skills: ['Electrician'],
  verificationStatus: 'rejected',
  rejectionReason: 'Trade license documentation was illegible. Please submit a clearer image.',
  createdAt: '2026-10-19T08:00:00.000Z',
  updatedAt: '2026-10-19T08:00:00.000Z',
};

const mockApprovedProfile: ProviderProfileData = {
  id: 'app-approved-03',
  userId: 'user-03',
  displayName: 'Karthik Raja Waterproofing',
  phone: '9840112233',
  serviceArea: 'Central Metro',
  skills: ['Waterproofing', 'Roof repair'],
  verificationStatus: 'approved',
  ratingAverage: 5,
  reviewCount: 4,
  createdAt: '2026-10-19T08:00:00.000Z',
  updatedAt: '2026-10-19T08:00:00.000Z',
};

describe('ProviderPortalView Component', () => {
  const mockOpenLogin = vi.fn();
  const mockOpenApply = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders pending review view when provider application is under administrative review', async () => {
    localStorage.setItem(
      'dwellio_user',
      JSON.stringify({
        id: 'user-01',
        name: 'Selvi Murugan',
        email: 'selvi@example.com',
        role: 'customer',
        isActive: true,
      })
    );
    localStorage.setItem('dwellio_token', 'valid-token-01');

    vi.mocked(providerService.fetchProviderApplicationStatus).mockResolvedValue({
      hasApplication: true,
      application: mockPendingProfile,
    });

    render(
      <AuthProvider>
        <ProviderPortalView onOpenLogin={mockOpenLogin} onOpenApply={mockOpenApply} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/application status: pending review/i)).toBeInTheDocument();
      expect(screen.getByText(/your provider application is under review/i)).toBeInTheDocument();
      expect(screen.getByText('Selvi Quality Plumbing')).toBeInTheDocument();
      expect(screen.getByText(/west coast district/i)).toBeInTheDocument();
    });
  });

  it('renders rejection notice with reason and resubmission form when application is rejected', async () => {
    localStorage.setItem(
      'dwellio_user',
      JSON.stringify({
        id: 'user-02',
        name: 'Quick Fix',
        email: 'quickfix@example.com',
        role: 'customer',
        isActive: true,
      })
    );
    localStorage.setItem('dwellio_token', 'valid-token-02');

    vi.mocked(providerService.fetchProviderApplicationStatus).mockResolvedValue({
      hasApplication: true,
      application: mockRejectedProfile,
    });

    render(
      <AuthProvider>
        <ProviderPortalView onOpenLogin={mockOpenLogin} onOpenApply={mockOpenApply} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/application decision: needs revision/i)).toBeInTheDocument();
      expect(screen.getByText(/trade license documentation was illegible/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /resubmit application for review/i })).toBeInTheDocument();
    });
  });

  it('renders provider partner portal workspace with tabs and switches to ProviderBookingsView', async () => {
    localStorage.setItem(
      'dwellio_user',
      JSON.stringify({
        id: 'user-03',
        name: 'Karthik Raja',
        email: 'karthik@example.com',
        role: 'provider',
        isActive: true,
      })
    );
    localStorage.setItem('dwellio_token', 'valid-token-03');

    vi.mocked(providerService.fetchProviderApplicationStatus).mockResolvedValue({
      hasApplication: true,
      application: mockApprovedProfile,
    });
    vi.mocked(bookingService.fetchProviderBookings).mockResolvedValue([]);

    render(
      <AuthProvider>
        <ProviderPortalView onOpenLogin={mockOpenLogin} onOpenApply={mockOpenApply} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Provider Partner Portal/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Bookings & Jobs/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Schedule & Availability/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reviews Hub/i })).toBeInTheDocument();
    });

    // Switch to Bookings & Jobs tab
    const bookingsTab = screen.getAllByRole('button', { name: /Bookings & Jobs/i })[0];
    fireEvent.click(bookingsTab);

    await waitFor(() => {
      expect(screen.getByText(/provider booking management/i)).toBeInTheDocument();
    });
  });
});

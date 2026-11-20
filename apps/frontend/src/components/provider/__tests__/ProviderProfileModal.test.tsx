import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProviderProfileModal } from '../ProviderProfileModal';
import { AuthProvider } from '../../../context/AuthContext';
import * as providerService from '../../../services/providerService';

vi.mock('../../../services/providerService', () => ({
  fetchCurrentProviderProfile: vi.fn(),
  updateCurrentProviderProfile: vi.fn(),
  submitProviderApplication: vi.fn(),
  fetchProviderApplicationStatus: vi.fn(),
}));

const mockProfile = {
  id: 'prov-profile-123',
  userId: 'user-prov-1',
  displayName: 'Karthik Roofing & Waterproofing',
  phone: '+91 98765 43210',
  bio: 'Expert residential and commercial roofing with 12 years track record.',
  experienceYears: 12,
  serviceArea: 'East & North Bengaluru',
  businessAddress: '15 Indiranagar 100ft Rd',
  city: 'Bengaluru',
  skills: ['Roof repair', 'Waterproofing'],
  verificationStatus: 'approved' as const,
  ratingAverage: 4.9,
  reviewCount: 22,
  isAcceptingJobs: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ProviderProfileModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Simulate logged in provider
    localStorage.setItem(
      'dwellio_user',
      JSON.stringify({
        id: 'user-prov-1',
        name: 'Karthik Raja',
        email: 'karthik.roofing@example.com',
        role: 'provider',
        isActive: true,
      })
    );
    localStorage.setItem('dwellio_token', 'valid-provider-jwt');
    vi.mocked(providerService.fetchCurrentProviderProfile).mockResolvedValue(mockProfile);
  });

  it('renders modal with provider business details and read-only rating badge', async () => {
    render(
      <AuthProvider>
        <ProviderProfileModal isOpen={true} onClose={vi.fn()} />
      </AuthProvider>
    );

    expect(screen.getByRole('heading', { name: /provider business profile/i })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Karthik Roofing & Waterproofing')).toBeInTheDocument();
    expect(screen.getByDisplayValue('+91 98765 43210')).toBeInTheDocument();
    expect(screen.getByDisplayValue(/expert residential and commercial roofing/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('12')).toBeInTheDocument();
    expect(screen.getByDisplayValue('East & North Bengaluru')).toBeInTheDocument();
    expect(screen.getByText(/verified specialist/i)).toBeInTheDocument();
    expect(screen.getByText(/4\.9 \(22 reviews\)/i)).toBeInTheDocument();
  });

  it('submits updated profile info and triggers updateCurrentProviderProfile', async () => {
    const handleUpdated = vi.fn();
    vi.mocked(providerService.updateCurrentProviderProfile).mockResolvedValue({
      ...mockProfile,
      displayName: 'Karthik Roofing Advanced',
      experienceYears: 13,
    });

    render(
      <AuthProvider>
        <ProviderProfileModal isOpen={true} onClose={vi.fn()} onProfileUpdated={handleUpdated} />
      </AuthProvider>
    );

    const nameInput = await screen.findByDisplayValue('Karthik Roofing & Waterproofing');
    fireEvent.change(nameInput, { target: { value: 'Karthik Roofing Advanced' } });

    const expInput = screen.getByDisplayValue('12');
    fireEvent.change(expInput, { target: { value: '13' } });

    const saveBtn = screen.getByRole('button', { name: /save profile/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(providerService.updateCurrentProviderProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Karthik Roofing Advanced',
          experienceYears: 13,
        }),
        'valid-provider-jwt'
      );
      expect(screen.getByText(/business profile updated successfully/i)).toBeInTheDocument();
      expect(handleUpdated).toHaveBeenCalled();
    });
  });

  it('displays client validation error when phone number format is invalid', async () => {
    render(
      <AuthProvider>
        <ProviderProfileModal isOpen={true} onClose={vi.fn()} />
      </AuthProvider>
    );

    const phoneInput = await screen.findByDisplayValue('+91 98765 43210');
    fireEvent.change(phoneInput, { target: { value: 'invalid-phone' } });

    const saveBtn = screen.getByRole('button', { name: /save profile/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/please provide a valid contact phone number/i)).toBeInTheDocument();
      expect(providerService.updateCurrentProviderProfile).not.toHaveBeenCalled();
    });
  });

  it('closes modal on close button click and escape key', async () => {
    const handleClose = vi.fn();
    render(
      <AuthProvider>
        <ProviderProfileModal isOpen={true} onClose={handleClose} />
      </AuthProvider>
    );

    await screen.findByDisplayValue('Karthik Roofing & Waterproofing');

    const closeBtn = screen.getByLabelText(/close modal/i);
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});

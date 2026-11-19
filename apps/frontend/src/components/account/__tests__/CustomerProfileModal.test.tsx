import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CustomerProfileModal } from '../CustomerProfileModal';
import { AuthProvider } from '../../../context/AuthContext';
import * as authService from '../../../services/authService';

vi.mock('../../../services/authService', () => ({
  updateUserProfile: vi.fn(),
  loginUser: vi.fn(),
  registerCustomer: vi.fn(),
  fetchCurrentUser: vi.fn(),
}));

describe('CustomerProfileModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders customer profile information with read-only email', () => {
    render(
      <AuthProvider>
        <CustomerProfileModal isOpen={true} onClose={vi.fn()} />
      </AuthProvider>
    );

    expect(screen.getByRole('heading', { name: /account & profile/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address \(read-only\)/i)).toBeDisabled();
    expect(screen.getByLabelText(/display name \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contact phone/i)).toBeInTheDocument();
  });

  it('submits updated profile info and triggers updateUserProfile', async () => {
    vi.mocked(authService.updateUserProfile).mockResolvedValue({
      id: 'demo-customer-id',
      name: 'Pooja Updated',
      email: 'customer@example.com',
      role: 'customer',
      phone: '+91 9840122334',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    render(
      <AuthProvider>
        <CustomerProfileModal isOpen={true} onClose={vi.fn()} />
      </AuthProvider>
    );

    const nameInput = screen.getByLabelText(/display name \*/i);
    const phoneInput = screen.getByLabelText(/contact phone/i);

    fireEvent.change(nameInput, { target: { value: 'Pooja Updated' } });
    fireEvent.change(phoneInput, { target: { value: '+91 9840122334' } });

    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => {
      expect(authService.updateUserProfile).toHaveBeenCalledWith(
        {
          name: 'Pooja Updated',
          phone: '+91 9840122334',
        },
        expect.anything()
      );
      expect(screen.getByText(/profile information updated successfully/i)).toBeInTheDocument();
    });
  });

  it('allows managing saved addresses: adding, listing, and switching tabs', async () => {
    render(
      <AuthProvider>
        <CustomerProfileModal isOpen={true} onClose={vi.fn()} />
      </AuthProvider>
    );

    // Switch to Saved Addresses tab
    const addressTab = screen.getByRole('button', { name: /saved addresses/i });
    fireEvent.click(addressTab);

    expect(screen.getByText(/my service locations/i)).toBeInTheDocument();

    // Click Add Address
    fireEvent.click(screen.getByRole('button', { name: /add address/i }));

    expect(screen.getByText(/add new address/i)).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByLabelText(/street address \*/i), {
      target: { value: '45 Lake View Road' },
    });
    fireEvent.change(screen.getByLabelText(/city \*/i), {
      target: { value: 'Chennai' },
    });
    fireEvent.change(screen.getByLabelText(/postal code/i), {
      target: { value: '600042' },
    });

    // Save Address
    fireEvent.click(screen.getByRole('button', { name: /save address/i }));

    await waitFor(() => {
      expect(screen.getByText('45 Lake View Road, Chennai - 600042')).toBeInTheDocument();
    });
  });
});

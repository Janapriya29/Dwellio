import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthModal } from '../AuthModal';
import { AuthProvider } from '../../../context/AuthContext';
import * as authService from '../../../services/authService';

vi.mock('../../../services/authService', () => ({
  loginUser: vi.fn(),
  registerCustomer: vi.fn(),
  fetchCurrentUser: vi.fn(),
}));

vi.mock('../../../services/providerService', () => ({
  submitProviderApplication: vi.fn(),
  fetchProviderApplicationStatus: vi.fn(),
}));

describe('AuthModal Component', () => {
  const mockClose = vi.fn();
  const mockSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const renderModal = (mode: 'login' | 'register-customer' | 'apply-provider' = 'login') =>
    render(
      <AuthProvider>
        <AuthModal
          isOpen={true}
          initialMode={mode}
          onClose={mockClose}
          onSuccess={mockSuccess}
        />
      </AuthProvider>
    );

  it('renders login form by default with email and password fields', () => {
    renderModal('login');

    expect(screen.getByRole('heading', { name: /sign in to your account/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/••••••••/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();

    // Verify switch mode options
    expect(screen.getByRole('button', { name: /sign up as customer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply to become a provider/i })).toBeInTheDocument();
  });

  it('switches between login, customer registration, and provider application', () => {
    renderModal('login');

    // Switch to register-customer
    fireEvent.click(screen.getByRole('button', { name: /sign up as customer/i }));
    expect(screen.getByRole('heading', { name: /create your customer account/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/jane doe/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/min 8 characters/i)).toBeInTheDocument();

    // Switch back to login
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(screen.getByRole('heading', { name: /sign in to your account/i })).toBeInTheDocument();

    // Switch to apply-provider
    fireEvent.click(screen.getByRole('button', { name: /apply to become a provider/i }));
    expect(screen.getByRole('heading', { name: /join dwellio as a verified provider/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/anand plumbing/i)).toBeInTheDocument();
  });

  it('submits login credentials successfully and triggers onSuccess', async () => {
    vi.mocked(authService.loginUser).mockResolvedValue({
      user: {
        id: 'cust-123',
        name: 'Pooja Sharma',
        email: 'customer@example.com',
        role: 'customer',
        isActive: true,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      },
      token: 'jwt-cust-token',
    });

    renderModal('login');

    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), {
      target: { value: 'customer@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), {
      target: { value: 'DemoCustomer2026!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(authService.loginUser).toHaveBeenCalledWith({
        email: 'customer@example.com',
        password: 'DemoCustomer2026!',
      });
      expect(mockSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'customer@example.com', role: 'customer' }),
        'discover'
      );
    });
  });

  it('displays validation error if registration passwords do not match', async () => {
    renderModal('register-customer');

    fireEvent.change(screen.getByPlaceholderText(/jane doe/i), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByPlaceholderText(/jane@example.com/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/min 8 characters/i), {
      target: { value: 'Secret123!' },
    });
    fireEvent.change(screen.getByPlaceholderText(/repeat password/i), {
      target: { value: 'DifferentPassword!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create customer account/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      expect(authService.registerCustomer).not.toHaveBeenCalled();
    });
  });

  it('prefills development admin credentials when admin dev button is clicked', () => {
    renderModal('login');

    const adminPrefillBtn = screen.getByRole('button', { name: /🛡️ admin/i });
    expect(adminPrefillBtn).toBeInTheDocument();

    fireEvent.click(adminPrefillBtn);

    const emailInput = screen.getByPlaceholderText(/you@example.com/i) as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText(/••••••••/i) as HTMLInputElement;

    expect(emailInput.value).toBe('admin@dwellio.local');
    expect(passwordInput.value).toBe('DwellioAdmin2026!');
  });
});

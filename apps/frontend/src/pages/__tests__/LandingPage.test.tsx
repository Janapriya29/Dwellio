import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LandingPage } from '../LandingPage';

describe('LandingPage Component', () => {
  const mockExploreServices = vi.fn();
  const mockOpenLogin = vi.fn();
  const mockOpenCustomerSignUp = vi.fn();
  const mockOpenProviderApply = vi.fn();

  const renderComponent = () =>
    render(
      <LandingPage
        onExploreServices={mockExploreServices}
        onOpenLogin={mockOpenLogin}
        onOpenCustomerSignUp={mockOpenCustomerSignUp}
        onOpenProviderApply={mockOpenProviderApply}
      />
    );

  it('renders official brand title, tagline, and trust badges', () => {
    renderComponent();

    // Verify main brand heading
    expect(screen.getByRole('heading', { name: /your home,.*in good hands/i })).toBeInTheDocument();

    // Verify trust highlights
    expect(screen.getByText(/100% admin-verified trade professionals/i)).toBeInTheDocument();
    expect(screen.getByText(/admin-vetted only/i)).toBeInTheDocument();
    expect(screen.getByText(/guaranteed time slots/i)).toBeInTheDocument();
    expect(screen.getByText(/100% verified reviews/i)).toBeInTheDocument();
  });

  it('renders the 5 primary service categories and interactive teaser', () => {
    renderComponent();

    expect(screen.getByText(/roofing & waterproofing/i)).toBeInTheDocument();
    expect(screen.getByText(/plumbing & sanitary/i)).toBeInTheDocument();
    expect(screen.getByText(/electrical & climate control/i)).toBeInTheDocument();
    expect(screen.getByText(/kitchen & appliance care/i)).toBeInTheDocument();
    expect(screen.getByText(/garden & outdoor care/i)).toBeInTheDocument();
    expect(screen.getByText(/interactive cutaway view/i)).toBeInTheDocument();
  });

  it('renders the 3-step How It Works guide and 4-point verification standards', () => {
    renderComponent();

    expect(screen.getByText(/how dwellio works/i)).toBeInTheDocument();
    expect(screen.getByText(/01/)).toBeInTheDocument();
    expect(screen.getByText(/pick a room or service/i)).toBeInTheDocument();
    expect(screen.getByText(/02/)).toBeInTheDocument();
    expect(screen.getByText(/select a verified pro/i)).toBeInTheDocument();
    expect(screen.getByText(/03/)).toBeInTheDocument();
    expect(screen.getByText(/reserve & track status/i)).toBeInTheDocument();

    // 4 Checkpoints
    expect(screen.getByText(/the dwellio 4-check verification standard/i)).toBeInTheDocument();
    expect(screen.getByText(/1. government id/i)).toBeInTheDocument();
    expect(screen.getByText(/2. trade skills/i)).toBeInTheDocument();
    expect(screen.getByText(/3. safety clearance/i)).toBeInTheDocument();
    expect(screen.getByText(/4. admin approval/i)).toBeInTheDocument();
  });

  it('triggers onExploreServices when clicking Explore Services button or category button', () => {
    renderComponent();

    const heroExploreBtn = screen.getByRole('button', { name: /explore services/i });
    fireEvent.click(heroExploreBtn);
    expect(mockExploreServices).toHaveBeenCalledWith('living');

    const roofExploreBtn = screen.getByRole('button', { name: /explore roofing/i });
    fireEvent.click(roofExploreBtn);
    expect(mockExploreServices).toHaveBeenCalledWith('roof');
  });

  it('triggers onOpenCustomerSignUp, onOpenProviderApply, and onOpenLogin on respective actions', () => {
    renderComponent();

    const signUpBtn = screen.getByRole('button', { name: /customer sign up/i });
    fireEvent.click(signUpBtn);
    expect(mockOpenCustomerSignUp).toHaveBeenCalledTimes(1);

    const providerApplyBtn = screen.getByRole('button', { name: /become a provider/i });
    fireEvent.click(providerApplyBtn);
    expect(mockOpenProviderApply).toHaveBeenCalledTimes(1);

    const loginBtn = screen.getByRole('button', { name: /sign in to your account/i });
    fireEvent.click(loginBtn);
    expect(mockOpenLogin).toHaveBeenCalledTimes(1);
  });
});

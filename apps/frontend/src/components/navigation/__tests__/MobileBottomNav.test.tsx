import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileBottomNav } from '../MobileBottomNav';

describe('MobileBottomNav Component', () => {
  it('renders all four primary navigation targets', () => {
    render(
      <MobileBottomNav
        activeTab="landing"
        isAuthenticated={true}
        userRole="customer"
        onSelectTab={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenLogin={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /home page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explore services/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bookings/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /account and profile/i })).toBeInTheDocument();
  });

  it('renders role-aware targets: Bookings for customer, Jobs for provider, Oversight for admin', () => {
    const { rerender } = render(
      <MobileBottomNav
        activeTab="landing"
        isAuthenticated={true}
        userRole="customer"
        onSelectTab={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenLogin={vi.fn()}
      />
    );
    expect(screen.getByText('Bookings')).toBeInTheDocument();

    // Provider
    rerender(
      <MobileBottomNav
        activeTab="landing"
        isAuthenticated={true}
        userRole="provider"
        onSelectTab={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenLogin={vi.fn()}
      />
    );
    expect(screen.getByText('Jobs')).toBeInTheDocument();

    // Admin
    rerender(
      <MobileBottomNav
        activeTab="landing"
        isAuthenticated={true}
        userRole="admin"
        onSelectTab={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenLogin={vi.fn()}
      />
    );
    expect(screen.getByText('Oversight')).toBeInTheDocument();
  });

  it('applies aria-current="page" to the active tab', () => {
    render(
      <MobileBottomNav
        activeTab="discover"
        isAuthenticated={true}
        userRole="customer"
        onSelectTab={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenLogin={vi.fn()}
      />
    );

    const servicesBtn = screen.getByRole('button', { name: /explore services/i });
    expect(servicesBtn).toHaveAttribute('aria-current', 'page');

    const homeBtn = screen.getByRole('button', { name: /home page/i });
    expect(homeBtn).not.toHaveAttribute('aria-current');
  });

  it('opens profile modal when authenticated, or login when unauthenticated', () => {
    const handleOpenProfile = vi.fn();
    const handleOpenLogin = vi.fn();

    const { rerender } = render(
      <MobileBottomNav
        activeTab="landing"
        isAuthenticated={true}
        userRole="customer"
        onSelectTab={vi.fn()}
        onOpenProfile={handleOpenProfile}
        onOpenLogin={handleOpenLogin}
      />
    );

    const accountBtn = screen.getByRole('button', { name: /account and profile/i });
    fireEvent.click(accountBtn);
    expect(handleOpenProfile).toHaveBeenCalledTimes(1);
    expect(handleOpenLogin).not.toHaveBeenCalled();

    // Unauthenticated
    rerender(
      <MobileBottomNav
        activeTab="landing"
        isAuthenticated={false}
        onSelectTab={vi.fn()}
        onOpenProfile={handleOpenProfile}
        onOpenLogin={handleOpenLogin}
      />
    );

    fireEvent.click(accountBtn);
    expect(handleOpenLogin).toHaveBeenCalledTimes(1);
  });

  it('renders unread indicator dot when hasUnreadAlerts is true', () => {
    const { rerender } = render(
      <MobileBottomNav
        activeTab="landing"
        isAuthenticated={true}
        userRole="customer"
        hasUnreadAlerts={false}
        onSelectTab={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenLogin={vi.fn()}
      />
    );

    expect(screen.queryByTestId('mobile-nav-unread-dot')).not.toBeInTheDocument();

    rerender(
      <MobileBottomNav
        activeTab="landing"
        isAuthenticated={true}
        userRole="customer"
        hasUnreadAlerts={true}
        onSelectTab={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenLogin={vi.fn()}
      />
    );

    expect(screen.getByTestId('mobile-nav-unread-dot')).toBeInTheDocument();
  });

  it('ensures all buttons have minimum 48x48px touch target classes', () => {
    render(
      <MobileBottomNav
        activeTab="landing"
        isAuthenticated={true}
        userRole="customer"
        onSelectTab={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenLogin={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    for (const btn of buttons) {
      expect(btn.className).toContain('min-h-[48px]');
      expect(btn.className).toContain('min-w-[48px]');
    }
  });
});

import React from 'react';
import { UserRole } from '@dwellio/shared';
import { AppTab } from '../../App';

export interface MobileBottomNavProps {
  activeTab: AppTab;
  userRole?: UserRole;
  isAuthenticated: boolean;
  hasUnreadAlerts?: boolean;
  onSelectTab: (tab: AppTab) => void;
  onOpenProfile: () => void;
  onOpenLogin: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  userRole,
  isAuthenticated,
  hasUnreadAlerts = false,
  onSelectTab,
  onOpenProfile,
  onOpenLogin,
}) => {
  // Determine role-aware 3rd navigation destination
  const getBookingsTarget = (): { tab: AppTab; label: string; icon: string } => {
    if (userRole === 'admin') {
      return { tab: 'admin-dashboard', label: 'Oversight', icon: '🛡️' };
    }
    if (userRole === 'provider') {
      return { tab: 'provider-portal', label: 'Jobs', icon: '🔧' };
    }
    return { tab: 'my-bookings', label: 'Bookings', icon: '📋' };
  };

  const bookingsTarget = getBookingsTarget();
  const isBookingsActive = activeTab === bookingsTarget.tab;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-dwellio-mint/40 shadow-lg px-2 py-1 flex items-center justify-around safe-area-inset-bottom"
      aria-label="Mobile Bottom Navigation"
      data-testid="mobile-bottom-nav"
    >
      {/* 1. Home */}
      <button
        type="button"
        onClick={() => onSelectTab('landing')}
        className={`flex-1 min-h-[48px] min-w-[48px] flex flex-col items-center justify-center p-1 rounded-xl transition text-center ${
          activeTab === 'landing'
            ? 'text-dwellio-teal font-black'
            : 'text-dwellio-teal/60 hover:text-dwellio-teal font-medium'
        }`}
        aria-label="Home page"
        aria-current={activeTab === 'landing' ? 'page' : undefined}
      >
        <span className="text-xl leading-none" aria-hidden="true">
          🏡
        </span>
        <span className="text-[10px] mt-1 leading-tight tracking-tight">
          Home
        </span>
        {activeTab === 'landing' && (
          <span className="w-1.5 h-1 bg-dwellio-teal rounded-full mt-0.5" />
        )}
      </button>

      {/* 2. Services / Explore Cutaway */}
      <button
        type="button"
        onClick={() => onSelectTab('discover')}
        className={`flex-1 min-h-[48px] min-w-[48px] flex flex-col items-center justify-center p-1 rounded-xl transition text-center ${
          activeTab === 'discover'
            ? 'text-dwellio-teal font-black'
            : 'text-dwellio-teal/60 hover:text-dwellio-teal font-medium'
        }`}
        aria-label="Explore services and interactive house cutaway"
        aria-current={activeTab === 'discover' ? 'page' : undefined}
      >
        <span className="text-xl leading-none" aria-hidden="true">
          🏠
        </span>
        <span className="text-[10px] mt-1 leading-tight tracking-tight">
          Services
        </span>
        {activeTab === 'discover' && (
          <span className="w-1.5 h-1 bg-dwellio-teal rounded-full mt-0.5" />
        )}
      </button>

      {/* 3. Role-Aware Bookings / Jobs / Oversight */}
      <button
        type="button"
        onClick={() => {
          if (!isAuthenticated) {
            onOpenLogin();
          } else {
            onSelectTab(bookingsTarget.tab);
          }
        }}
        className={`relative flex-1 min-h-[48px] min-w-[48px] flex flex-col items-center justify-center p-1 rounded-xl transition text-center ${
          isBookingsActive
            ? 'text-dwellio-teal font-black'
            : 'text-dwellio-teal/60 hover:text-dwellio-teal font-medium'
        }`}
        aria-label={bookingsTarget.label}
        aria-current={isBookingsActive ? 'page' : undefined}
      >
        <div className="relative leading-none">
          <span className="text-xl leading-none" aria-hidden="true">
            {bookingsTarget.icon}
          </span>
          {/* Unread alert indicator dot */}
          {hasUnreadAlerts && (
            <span
              className="absolute -top-0.5 -right-1.5 w-2.5 h-2.5 bg-[#D9653B] border-2 border-white rounded-full"
              data-testid="mobile-nav-unread-dot"
              aria-label="New alerts available"
            />
          )}
        </div>
        <span className="text-[10px] mt-1 leading-tight tracking-tight">
          {bookingsTarget.label}
        </span>
        {isBookingsActive && (
          <span className="w-1.5 h-1 bg-dwellio-teal rounded-full mt-0.5" />
        )}
      </button>

      {/* 4. Account / Profile */}
      <button
        type="button"
        onClick={() => {
          if (isAuthenticated) {
            onOpenProfile();
          } else {
            onOpenLogin();
          }
        }}
        className="flex-1 min-h-[48px] min-w-[48px] flex flex-col items-center justify-center p-1 rounded-xl transition text-center text-dwellio-teal/60 hover:text-dwellio-teal font-medium"
        aria-label="Account and Profile"
      >
        <span className="text-xl leading-none" aria-hidden="true">
          👤
        </span>
        <span className="text-[10px] mt-1 leading-tight tracking-tight">
          {isAuthenticated ? 'Profile' : 'Sign In'}
        </span>
      </button>
    </nav>
  );
};

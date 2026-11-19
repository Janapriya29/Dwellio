import React, { useState, useEffect } from 'react';
import { HouseRoom } from '@dwellio/shared';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LandingPage } from './pages/LandingPage';
import { ServiceDiscoveryPage } from './pages/ServiceDiscoveryPage';
import { MyBookingsView } from './components/booking/MyBookingsView';
import { ProviderPortalView } from './components/booking/ProviderPortalView';
import { AdminDashboardLayout } from './components/admin/AdminDashboardLayout';
import { NotificationBell } from './components/notification/NotificationBell';
import { AuthModal, AuthModalMode } from './components/auth/AuthModal';
import { CustomerProfileModal } from './components/account/CustomerProfileModal';
import { MobileBottomNav } from './components/navigation/MobileBottomNav';

export type AppTab = 'landing' | 'discover' | 'my-bookings' | 'provider-portal' | 'admin-dashboard';

export const parseHashToTab = (hash: string): AppTab | null => {
  const [routePart] = hash.split('?');
  const clean = routePart.replace(/^#\/?/, '').toLowerCase();
  if (!clean || clean === 'home' || clean === 'landing') return 'landing';
  if (clean === 'discover' || clean === 'services' || clean === 'cutaway') return 'discover';
  if (clean === 'my-bookings' || clean === 'bookings') return 'my-bookings';
  if (clean === 'provider-portal' || clean === 'provider') return 'provider-portal';
  if (clean === 'admin-dashboard' || clean === 'admin') return 'admin-dashboard';
  return null;
};

const tabToHash = (tab: AppTab): string => {
  switch (tab) {
    case 'landing':
      return '#/';
    case 'discover':
      return '#/discover';
    case 'my-bookings':
      return '#/bookings';
    case 'provider-portal':
      return '#/provider';
    case 'admin-dashboard':
      return '#/admin';
    default:
      return '#/';
  }
};

const MainLayout: React.FC = () => {
  const { user, isAuthenticated, logout, switchDemoRole } = useAuth();

  // Tab state initialization with hash support
  const [activeTab, setActiveTabState] = useState<AppTab>(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const fromHash = parseHashToTab(window.location.hash);
      if (fromHash) return fromHash;
    }
    return user ? 'discover' : 'landing';
  });

  const [selectedRoom, setSelectedRoom] = useState<HouseRoom>('living');

  // Auth modal state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');
  const [postLoginRedirect, setPostLoginRedirect] = useState<AppTab | undefined>(undefined);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);

  const setActiveTab = (tab: AppTab) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      window.location.hash = tabToHash(tab);
    }
  };

  // Sync hash changes (e.g. browser back/forward buttons)
  useEffect(() => {
    const handleHashChange = () => {
      const tab = parseHashToTab(window.location.hash);
      if (tab) {
        setActiveTabState(tab);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const openAuth = (mode: AuthModalMode, redirect?: AppTab) => {
    setAuthModalMode(mode);
    setPostLoginRedirect(redirect);
    setIsAuthModalOpen(true);
  };

  const handleLogout = () => {
    logout();
    setActiveTab('landing');
  };

  return (
    <div className="min-h-screen bg-dwellio-ivory text-dwellio-teal flex flex-col justify-between">
      {/* Top Header - Streamlined ~56px single-row mobile bar (h-14 md:h-16) */}
      <header className="border-b border-dwellio-mint/30 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-3">
          {/* Brand Logo & Tagline */}
          <button
            type="button"
            onClick={() => setActiveTab('landing')}
            className="flex items-center gap-2.5 sm:gap-3 text-left group shrink-0"
            title="Dwellio Home"
          >
            <span className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-dwellio-teal flex items-center justify-center shadow-xs text-dwellio-mint font-bold text-base sm:text-xl group-hover:opacity-90 transition">
              D
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-dwellio-teal">
                  Dwellio
                </span>
                <span className="w-2 h-2 rounded-xs bg-[#D9653B]" aria-hidden="true" />
              </div>
              <p className="text-xs font-medium text-dwellio-teal/70 hidden sm:block">
                Your Home, in Good Hands.
              </p>
            </div>
          </button>

          {/* Desktop Navigation Links & Persona Views (hidden on mobile) */}
          <nav className="hidden md:flex items-center gap-1.5 bg-dwellio-ivory/80 p-1 rounded-2xl border border-dwellio-mint/50 overflow-x-auto scrollbar-none">
            {/* Home Link */}
            <button
              type="button"
              onClick={() => setActiveTab('landing')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'landing'
                  ? 'bg-dwellio-teal text-white shadow-xs'
                  : 'text-dwellio-teal/70 hover:text-dwellio-teal'
              }`}
            >
              <span>🏡</span>
              <span>Home</span>
            </button>

            {/* Explore Cutaway / Services */}
            <button
              type="button"
              onClick={() => setActiveTab('discover')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'discover'
                  ? 'bg-dwellio-teal text-white shadow-xs'
                  : 'text-dwellio-teal/70 hover:text-dwellio-teal'
              }`}
            >
              <span>🏠</span>
              <span>Explore Cutaway</span>
            </button>

            {/* Customer Bookings Tab */}
            {(!isAuthenticated || user?.role === 'customer') && (
              <button
                type="button"
                onClick={() => {
                  if (!isAuthenticated) {
                    openAuth('login', 'my-bookings');
                  } else {
                    setActiveTab('my-bookings');
                  }
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'my-bookings'
                    ? 'bg-dwellio-teal text-white shadow-xs'
                    : 'text-dwellio-teal/70 hover:text-dwellio-teal'
                }`}
              >
                <span>📋</span>
                <span>My Bookings</span>
              </button>
            )}

            {/* Provider Portal Tab */}
            {(!isAuthenticated || user?.role === 'provider' || user?.role === 'customer') && (
              <button
                type="button"
                onClick={() => {
                  if (!isAuthenticated) {
                    openAuth('login', 'provider-portal');
                  } else {
                    setActiveTab('provider-portal');
                  }
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'provider-portal'
                    ? 'bg-dwellio-teal text-white shadow-xs'
                    : 'text-dwellio-teal/70 hover:text-dwellio-teal'
                }`}
              >
                <span>🔧</span>
                <span>Provider Portal</span>
              </button>
            )}

            {/* Admin Dashboard Tab (strictly visible for admin role) */}
            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={() => setActiveTab('admin-dashboard')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'admin-dashboard'
                    ? 'bg-dwellio-teal text-white shadow-xs'
                    : 'text-dwellio-teal/70 hover:text-dwellio-teal'
                }`}
              >
                <span>🛡️</span>
                <span>Admin Dashboard</span>
              </button>
            )}
          </nav>

          {/* Right Header Controls (Unified for Mobile & Desktop) */}
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <NotificationBell
                  onNavigate={(tab) => setActiveTab(tab)}
                  onUnreadCountChange={setUnreadNotificationCount}
                />

                {/* Mobile compact profile trigger */}
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(true)}
                  className="md:hidden p-1.5 rounded-xl text-sm font-bold text-dwellio-teal bg-dwellio-ivory border border-dwellio-mint hover:bg-dwellio-mint/20 transition flex items-center justify-center min-w-[36px] min-h-[36px]"
                  title="Account & Profile"
                  aria-label="Account & Profile"
                >
                  👤
                </button>

                {/* Desktop profile description */}
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(true)}
                  className="hidden lg:flex flex-col text-right text-[11px] leading-tight hover:opacity-80 transition cursor-pointer p-1.5 rounded-xl border border-transparent hover:border-dwellio-mint/60"
                  title="View and edit account profile"
                >
                  <span className="font-bold text-dwellio-teal flex items-center gap-1 justify-end">
                    <span>{user?.name}</span>
                    <span className="text-[10px] text-dwellio-teal/60">⚙️</span>
                  </span>
                  <span className="text-dwellio-teal/60 capitalize font-medium">
                    {user?.role === 'admin'
                      ? 'Administrator'
                      : user?.role === 'provider'
                      ? 'Service Provider'
                      : 'Customer'}
                  </span>
                </button>

                {/* Desktop Sign Out button (removed duplicate mobile button) */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="hidden md:inline-flex px-3 py-1.5 rounded-xl text-xs font-bold text-dwellio-teal hover:bg-dwellio-mint/30 border border-dwellio-mint/80 transition"
                  title="Sign out of current account"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openAuth('apply-provider')}
                  className="hidden sm:inline-flex px-3 py-1.5 rounded-xl text-xs font-bold text-[#D9653B] bg-white border border-[#D9653B]/40 hover:bg-[#D9653B]/10 transition"
                >
                  Become a Provider
                </button>

                <button
                  type="button"
                  onClick={() => openAuth('login')}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white text-dwellio-teal border border-dwellio-mint/80 hover:bg-dwellio-ivory transition shadow-xs"
                >
                  Sign In
                </button>

                <button
                  type="button"
                  onClick={() => openAuth('register-customer')}
                  className="hidden sm:inline-flex px-3.5 py-1.5 rounded-xl text-xs font-bold bg-dwellio-teal text-white hover:opacity-90 transition shadow-xs"
                >
                  Sign Up
                </button>
              </div>
            )}

            {/* Development Quick Persona Switcher */}
            {import.meta.env.DEV && (
              <div className="hidden xl:flex items-center gap-1 pl-2 border-l border-dwellio-mint/40">
                <button
                  type="button"
                  onClick={() => {
                    switchDemoRole('customer');
                    setActiveTab('my-bookings');
                  }}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white border border-dwellio-mint hover:bg-dwellio-mint/20 text-dwellio-teal transition"
                  title="Switch to Customer session (Pooja Sharma)"
                >
                  Customer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    switchDemoRole('karthik');
                    setActiveTab('provider-portal');
                  }}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white border border-dwellio-mint hover:bg-dwellio-mint/20 text-dwellio-teal transition"
                  title="Switch to Provider session (Karthik Raja)"
                >
                  Provider
                </button>
                <button
                  type="button"
                  onClick={() => {
                    switchDemoRole('admin');
                    setActiveTab('admin-dashboard');
                  }}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-50 border border-amber-300 hover:bg-amber-100 text-amber-900 transition"
                  title="Switch to Admin session (Dwellio Administrator)"
                >
                  Admin
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main View Area with safe mobile bottom padding */}
      <main className="flex-1 pb-20 md:pb-0">
        {activeTab === 'landing' && (
          <LandingPage
            onExploreServices={(room) => {
              if (room) setSelectedRoom(room);
              setActiveTab('discover');
            }}
            onOpenLogin={() => openAuth('login')}
            onOpenCustomerSignUp={() => openAuth('register-customer')}
            onOpenProviderApply={() => openAuth('apply-provider')}
          />
        )}

        {activeTab === 'discover' && (
          <ServiceDiscoveryPage
            initialRoom={selectedRoom}
            onRequireAuth={() => openAuth('login', 'discover')}
          />
        )}

        {activeTab === 'my-bookings' && (
          <MyBookingsView
            onExploreServices={() => setActiveTab('discover')}
            onOpenLogin={() => openAuth('login', 'my-bookings')}
          />
        )}

        {activeTab === 'provider-portal' && (
          <ProviderPortalView
            onOpenLogin={() => openAuth('login', 'provider-portal')}
            onOpenApply={() => openAuth('apply-provider')}
          />
        )}

        {activeTab === 'admin-dashboard' && <AdminDashboardLayout />}
      </main>

      {/* Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialMode={authModalMode}
        postLoginRedirect={postLoginRedirect}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={(loggedInUser, destination) => {
          if (destination) {
            setActiveTab(destination);
          } else if (loggedInUser.role === 'admin') {
            setActiveTab('admin-dashboard');
          } else if (loggedInUser.role === 'provider') {
            setActiveTab('provider-portal');
          } else {
            setActiveTab('discover');
          }
        }}
      />

      {/* Customer Profile & Address Book Modal */}
      <CustomerProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />

      {/* Comprehensive Brand Footer */}
      <footer className="border-t border-dwellio-mint/30 bg-white/70 py-10 text-xs text-dwellio-teal/70 mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8 pb-8 border-b border-dwellio-mint/30">
            {/* Column 1: Brand Info */}
            <div className="space-y-3 md:col-span-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black text-dwellio-teal">Dwellio</span>
                <span className="w-2 h-2 rounded-xs bg-[#D9653B]" aria-hidden="true" />
              </div>
              <p className="text-xs text-dwellio-teal/70 leading-relaxed">
                Your Home, in Good Hands.
              </p>
              <p className="text-[11px] text-dwellio-teal/60 leading-relaxed">
                The full-stack home services platform with verified trade professionals, guaranteed time slots, and verified customer reviews.
              </p>
            </div>

            {/* Column 2: Homeowners */}
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-dwellio-teal mb-3">
                For Homeowners
              </h3>
              <ul className="space-y-2 text-xs">
                <li>
                  <button
                    type="button"
                    onClick={() => setActiveTab('discover')}
                    className="hover:text-[#D9653B] transition"
                  >
                    Explore Services &amp; Cutaway
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isAuthenticated) openAuth('login', 'my-bookings');
                      else setActiveTab('my-bookings');
                    }}
                    className="hover:text-[#D9653B] transition"
                  >
                    My Bookings &amp; Appointments
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openAuth('register-customer')}
                    className="hover:text-[#D9653B] transition"
                  >
                    Customer Registration
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3: Providers */}
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-dwellio-teal mb-3">
                For Service Providers
              </h3>
              <ul className="space-y-2 text-xs">
                <li>
                  <button
                    type="button"
                    onClick={() => openAuth('apply-provider')}
                    className="hover:text-[#D9653B] transition font-medium"
                  >
                    Apply to Join Network
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isAuthenticated) openAuth('login', 'provider-portal');
                      else setActiveTab('provider-portal');
                    }}
                    className="hover:text-[#D9653B] transition"
                  >
                    Provider Portal Login
                  </button>
                </li>
                <li>
                  <span className="text-[11px] text-dwellio-teal/50">
                    4-Point Verification Required
                  </span>
                </li>
              </ul>
            </div>

            {/* Column 4: Platform & Governance */}
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-dwellio-teal mb-3">
                Administration
              </h3>
              <ul className="space-y-2 text-xs">
                {user?.role === 'admin' ? (
                  <li>
                    <button
                      type="button"
                      onClick={() => setActiveTab('admin-dashboard')}
                      className="hover:text-[#D9653B] transition font-bold text-dwellio-teal"
                    >
                      🛡️ Open Admin Dashboard
                    </button>
                  </li>
                ) : (
                  <li>
                    <button
                      type="button"
                      onClick={() => openAuth('login', 'admin-dashboard')}
                      className="hover:text-[#D9653B] transition text-dwellio-teal/70"
                      title="Sign in with your configured platform administrator account"
                    >
                      Administrator Sign In
                    </button>
                  </li>
                )}
                <li className="pt-2 text-[11px] text-dwellio-teal/60">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    System Operational
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-dwellio-teal/60">
            <p>&copy; {new Date().getFullYear()} Dwellio. Your Home, in Good Hands.</p>
            <p className="flex items-center gap-2">
              <span>Roofing</span>
              <span>•</span>
              <span>Plumbing</span>
              <span>•</span>
              <span>Electrical</span>
              <span>•</span>
              <span>Appliances</span>
              <span>•</span>
              <span>Outdoor Care</span>
            </p>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar (md:hidden) */}
      <MobileBottomNav
        activeTab={activeTab}
        userRole={user?.role}
        isAuthenticated={isAuthenticated}
        hasUnreadAlerts={unreadNotificationCount > 0}
        onSelectTab={(tab) => setActiveTab(tab)}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onOpenLogin={() => openAuth('login')}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
};

export default App;

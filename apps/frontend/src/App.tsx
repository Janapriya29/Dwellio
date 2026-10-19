import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ServiceDiscoveryPage } from './pages/ServiceDiscoveryPage';
import { MyBookingsView } from './components/booking/MyBookingsView';
import { ProviderBookingsView } from './components/booking/ProviderBookingsView';

type AppTab = 'discover' | 'my-bookings' | 'provider-portal';

const MainLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('discover');
  const { user, switchDemoRole } = useAuth();

  return (
    <div className="min-h-screen bg-dwellio-ivory text-dwellio-teal flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-dwellio-mint/30 bg-white/70 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Brand Logo & Tagline */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('discover')}
                className="w-10 h-10 rounded-2xl bg-dwellio-teal flex items-center justify-center shadow-xs text-dwellio-mint font-bold text-xl hover:opacity-90 transition"
                title="Dwellio Home"
              >
                D
              </button>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-2xl font-black tracking-tight text-dwellio-teal">
                    Dwellio
                  </span>
                  <span className="w-2 h-2 rounded-xs bg-[#D9653B]" aria-hidden="true" />
                </div>
                <p className="text-xs font-medium text-dwellio-teal/70 hidden sm:block">
                  Your Home, in Good Hands.
                </p>
              </div>
            </div>

            {/* Phase Badge */}
            <span className="md:hidden inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-dwellio-mint/40 text-dwellio-teal border border-dwellio-mint/80">
              Phase 6
            </span>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1.5 bg-dwellio-ivory/80 p-1 rounded-2xl border border-dwellio-mint/50">
            <button
              type="button"
              onClick={() => setActiveTab('discover')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'discover'
                  ? 'bg-dwellio-teal text-white shadow-xs'
                  : 'text-dwellio-teal/70 hover:text-dwellio-teal'
              }`}
            >
              <span>🏠</span>
              <span>Explore Cutaway</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('my-bookings')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'my-bookings'
                  ? 'bg-dwellio-teal text-white shadow-xs'
                  : 'text-dwellio-teal/70 hover:text-dwellio-teal'
              }`}
            >
              <span>📋</span>
              <span>My Bookings</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('provider-portal')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'provider-portal'
                  ? 'bg-dwellio-teal text-white shadow-xs'
                  : 'text-dwellio-teal/70 hover:text-dwellio-teal'
              }`}
            >
              <span>🔧</span>
              <span>Provider Portal</span>
            </button>
          </nav>

          {/* Active Persona / Role Switcher */}
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex flex-col text-right text-[11px]">
              <span className="font-bold text-dwellio-teal">{user?.name || 'Customer'}</span>
              <span className="text-dwellio-teal/60 capitalize">{user?.role || 'Guest'}</span>
            </div>

            {import.meta.env.DEV && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    switchDemoRole('customer');
                    setActiveTab('my-bookings');
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white border border-dwellio-mint/80 hover:bg-dwellio-mint/20 text-dwellio-teal transition"
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
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white border border-dwellio-mint/80 hover:bg-dwellio-mint/20 text-dwellio-teal transition"
                  title="Switch to Provider session (Karthik Raja)"
                >
                  Provider
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1">
        {activeTab === 'discover' && <ServiceDiscoveryPage />}
        {activeTab === 'my-bookings' && (
          <MyBookingsView onExploreServices={() => setActiveTab('discover')} />
        )}
        {activeTab === 'provider-portal' && <ProviderBookingsView />}
      </main>

      {/* Footer */}
      <footer className="border-t border-dwellio-mint/30 bg-white/40 py-6 text-center text-xs text-dwellio-teal/60 mt-12">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>&copy; {new Date().getFullYear()} Dwellio. Your Home, in Good Hands.</p>
          <p className="flex items-center gap-1.5 text-dwellio-teal/70">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Phase 6: Real Booking Lifecycle &amp; Scheduling Engine
          </p>
        </div>
      </footer>
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

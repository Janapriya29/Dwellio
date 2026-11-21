import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AdminOverviewView } from './AdminOverviewView';
import { AdminProvidersView } from './AdminProvidersView';
import { AdminCustomersView } from './AdminCustomersView';
import { AdminVerifiedProvidersView } from './AdminVerifiedProvidersView';
import { AdminCatalogView } from './AdminCatalogView';
import { AdminBookingsView } from './AdminBookingsView';
import { AdminDisputesView } from './AdminDisputesView';
import { AdminReviewsView } from './AdminReviewsView';
import { AdminAnnouncementsView } from './AdminAnnouncementsView';
import { AdminSettingsView } from './AdminSettingsView';
import { AdminAuditLogsView } from './AdminAuditLogsView';

export type AdminSubTab =
  | 'overview'
  | 'applications'
  | 'customers'
  | 'providers'
  | 'catalog'
  | 'bookings'
  | 'disputes'
  | 'reviews'
  | 'announcements'
  | 'settings'
  | 'audit-logs';

const SUB_TABS: { id: AdminSubTab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'applications', label: 'Applications', icon: '📝' },
  { id: 'customers', label: 'Customers', icon: '👥' },
  { id: 'providers', label: 'Providers', icon: '👷' },
  { id: 'catalog', label: 'Catalog', icon: '🗂️' },
  { id: 'bookings', label: 'Bookings', icon: '📅' },
  { id: 'disputes', label: 'Disputes', icon: '⚖️' },
  { id: 'reviews', label: 'Reviews', icon: '⭐' },
  { id: 'announcements', label: 'Announcements', icon: '📢' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'audit-logs', label: 'Audit Trail', icon: '📜' },
];

export const AdminDashboardLayout: React.FC = () => {
  const { user, switchDemoRole } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>('overview');

  // RBAC Access Guard: Ensure user has the 'admin' role
  if (!user || user.role !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="bg-white rounded-3xl border border-rose-200 p-8 text-center shadow-xs space-y-4">
          <div className="w-16 h-16 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-center text-3xl mx-auto">
            🚫
          </div>
          <div>
            <h2 className="text-xl font-bold text-dwellio-teal">Access Denied</h2>
            <p className="text-xs text-dwellio-teal/70 mt-1 max-w-md mx-auto">
              Administrator privileges are required to access platform oversight and management controls.
              You are currently authenticated as{' '}
              <strong className="text-dwellio-teal">{user?.name || 'Guest'}</strong> ({user?.role || 'none'}).
            </p>
          </div>

          {import.meta.env.DEV && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => switchDemoRole('admin')}
                className="px-5 py-2.5 bg-dwellio-teal hover:bg-dwellio-teal/90 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                Switch to Admin Persona (Dwellio Administrator)
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-dwellio-teal to-dwellio-teal/90 rounded-3xl p-6 text-white shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white border border-white/30 uppercase tracking-wider">
              Admin Portal
            </span>
            <span className="text-xs text-white/70">Dwellio Platform Control Center</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-1">Platform Management &amp; Oversight</h1>
          <p className="text-xs text-white/80 mt-0.5">
            Platform analytics, customer and provider governance, dispute adjudication, catalog, and broadcast alerts.
          </p>
        </div>

        <div className="bg-white/10 rounded-2xl p-3 border border-white/20 shrink-0 text-right">
          <div className="text-[11px] text-white/70">Logged in as</div>
          <div className="text-xs font-bold text-white">{user.name}</div>
          <div className="text-[10px] text-white/60">{user.email}</div>
        </div>
      </div>

      {/* Sub-Navigation Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 bg-white p-1.5 rounded-2xl border border-dwellio-mint/50 shadow-xs">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === tab.id
                ? 'bg-dwellio-teal text-white shadow-xs'
                : 'text-dwellio-teal/70 hover:text-dwellio-teal hover:bg-dwellio-ivory/50'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Sub-View Content */}
      <main>
        {activeSubTab === 'overview' && <AdminOverviewView onNavigateTab={setActiveSubTab} />}
        {activeSubTab === 'applications' && <AdminProvidersView />}
        {activeSubTab === 'customers' && <AdminCustomersView />}
        {activeSubTab === 'providers' && <AdminVerifiedProvidersView />}
        {activeSubTab === 'catalog' && <AdminCatalogView />}
        {activeSubTab === 'bookings' && <AdminBookingsView />}
        {activeSubTab === 'disputes' && <AdminDisputesView />}
        {activeSubTab === 'reviews' && <AdminReviewsView />}
        {activeSubTab === 'announcements' && <AdminAnnouncementsView />}
        {activeSubTab === 'settings' && <AdminSettingsView />}
        {activeSubTab === 'audit-logs' && <AdminAuditLogsView />}
      </main>
    </div>
  );
};

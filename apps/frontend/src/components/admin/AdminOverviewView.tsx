import React, { useState, useEffect, useCallback } from 'react';
import { AdminOverviewData, BookingStatus } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import { fetchAdminOverview } from '../../services/adminService';

interface AdminOverviewViewProps {
  onNavigateTab: (tab: 'applications' | 'catalog' | 'bookings' | 'reviews' | 'audit-logs') => void;
}

const BOOKING_STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  requested: { label: 'Requested', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  accepted: { label: 'Accepted', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200' },
  on_the_way: { label: 'On The Way', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' },
  in_progress: { label: 'In Progress', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200' },
  completed: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  cancelled: { label: 'Cancelled', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  rejected: { label: 'Rejected', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
};

export const AdminOverviewView: React.FC<AdminOverviewViewProps> = ({ onNavigateTab }) => {
  const { token } = useAuth();
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const overview = await fetchAdminOverview(token);
      setData(overview);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load platform overview.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  if (isLoading) {
    return (
      <div className="py-16 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-dwellio-teal border-t-transparent mb-3" />
        <p className="text-sm font-semibold text-dwellio-teal/70">Loading platform overview...</p>
      </div>
    );
  }

  if (errorMessage || !data) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-center">
        <p className="text-sm font-bold text-rose-800 mb-3">{errorMessage || 'Platform data unavailable.'}</p>
        <button
          type="button"
          onClick={loadOverview}
          className="px-4 py-2 bg-dwellio-teal text-white text-xs font-bold rounded-xl hover:opacity-95 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  const { stats, recentActivity } = data;

  return (
    <div className="space-y-8">
      {/* Top Notification Banner if Pending Applications */}
      {stats.pendingApplications > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-sm font-bold text-amber-900">
                {stats.pendingApplications} Provider {stats.pendingApplications === 1 ? 'Application' : 'Applications'} Pending Review
              </p>
              <p className="text-xs text-amber-800">
                New service professionals are awaiting administrative approval before they can accept bookings.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('applications')}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shrink-0 shadow-xs"
          >
            Review Applications &rarr;
          </button>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Customers */}
        <div className="p-4 bg-white rounded-2xl border border-dwellio-mint/40 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-dwellio-teal/60">Customers</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-dwellio-teal">{stats.totalCustomers}</span>
            <span className="text-lg">👥</span>
          </div>
        </div>

        {/* Total Providers */}
        <div className="p-4 bg-white rounded-2xl border border-dwellio-mint/40 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-dwellio-teal/60">Verified Pros</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-dwellio-teal">{stats.totalProviders}</span>
            <span className="text-lg">👷</span>
          </div>
        </div>

        {/* Pending Applications */}
        <div
          onClick={() => onNavigateTab('applications')}
          className="p-4 bg-white rounded-2xl border border-dwellio-mint/40 shadow-xs flex flex-col justify-between cursor-pointer hover:border-amber-400 transition"
        >
          <span className="text-xs font-semibold text-dwellio-teal/60">Pending Apps</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span
              className={`text-2xl font-black ${
                stats.pendingApplications > 0 ? 'text-amber-600' : 'text-dwellio-teal'
              }`}
            >
              {stats.pendingApplications}
            </span>
            <span className="text-lg">⏳</span>
          </div>
        </div>

        {/* Active Services */}
        <div
          onClick={() => onNavigateTab('catalog')}
          className="p-4 bg-white rounded-2xl border border-dwellio-mint/40 shadow-xs flex flex-col justify-between cursor-pointer hover:border-dwellio-teal/40 transition"
        >
          <span className="text-xs font-semibold text-dwellio-teal/60">Active Services</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-dwellio-teal">{stats.activeServices}</span>
            <span className="text-lg">🛠️</span>
          </div>
        </div>

        {/* Total Bookings */}
        <div
          onClick={() => onNavigateTab('bookings')}
          className="p-4 bg-white rounded-2xl border border-dwellio-mint/40 shadow-xs flex flex-col justify-between cursor-pointer hover:border-dwellio-teal/40 transition"
        >
          <span className="text-xs font-semibold text-dwellio-teal/60">Total Bookings</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-dwellio-teal">{stats.totalBookings}</span>
            <span className="text-lg">📅</span>
          </div>
        </div>

        {/* Total Reviews */}
        <div
          onClick={() => onNavigateTab('reviews')}
          className="p-4 bg-white rounded-2xl border border-dwellio-mint/40 shadow-xs flex flex-col justify-between cursor-pointer hover:border-dwellio-teal/40 transition"
        >
          <span className="text-xs font-semibold text-dwellio-teal/60">Total Reviews</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-dwellio-teal">{stats.totalReviews}</span>
            <span className="text-lg">⭐</span>
          </div>
        </div>
      </div>

      {/* Booking Status Breakdown */}
      <div className="bg-white rounded-2xl border border-dwellio-mint/40 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-dwellio-teal">Platform Booking Lifecycle Breakdown</h3>
          <button
            type="button"
            onClick={() => onNavigateTab('bookings')}
            className="text-xs font-semibold text-dwellio-teal hover:underline"
          >
            View all bookings &rarr;
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {(Object.keys(BOOKING_STATUS_CONFIG) as BookingStatus[]).map((status) => {
            const config = BOOKING_STATUS_CONFIG[status];
            const count = stats.bookingsByStatus[status] || 0;
            return (
              <div
                key={status}
                className={`p-3 rounded-xl border ${config.bg} ${config.border} flex flex-col items-center text-center`}
              >
                <span className={`text-xs font-bold ${config.text}`}>{config.label}</span>
                <span className={`text-xl font-black mt-1 ${config.text}`}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Admin Activity Feed */}
      <div className="bg-white rounded-2xl border border-dwellio-mint/40 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-dwellio-teal">Recent Administrative Audit Activity</h3>
            <p className="text-xs text-dwellio-teal/60">Immutable platform log of verified administrator actions</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('audit-logs')}
            className="text-xs font-semibold text-dwellio-teal hover:underline"
          >
            Full audit trail &rarr;
          </button>
        </div>

        {recentActivity.length === 0 ? (
          <p className="text-xs text-dwellio-teal/60 py-6 text-center italic">No administrative actions logged yet.</p>
        ) : (
          <div className="divide-y divide-dwellio-mint/20 overflow-x-auto">
            {recentActivity.map((log) => (
              <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-dwellio-ivory text-dwellio-teal border border-dwellio-mint/50">
                    {log.action}
                  </span>
                  <div>
                    <span className="font-semibold text-dwellio-teal">
                      {log.adminName || log.adminEmail || 'Admin'}
                    </span>
                    <span className="text-dwellio-teal/60 ml-1.5">
                      on {log.targetType} ({log.targetId.slice(-6)})
                    </span>
                  </div>
                </div>
                <div className="text-dwellio-teal/60 sm:text-right shrink-0">
                  {new Date(log.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

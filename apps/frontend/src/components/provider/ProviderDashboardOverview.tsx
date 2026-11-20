import React, { useState, useEffect, useCallback } from 'react';
import { ProviderDashboardStats, BookingData } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import { fetchProviderDashboardStats } from '../../services/providerService';
import { ProviderJobDetailsModal } from '../booking/ProviderJobDetailsModal';

interface ProviderDashboardOverviewProps {
  onNavigateTab?: (tab: 'bookings' | 'schedule' | 'reviews' | 'profile') => void;
}

export const ProviderDashboardOverview: React.FC<ProviderDashboardOverviewProps> = ({
  onNavigateTab,
}) => {
  const { token, user } = useAuth();
  const [stats, setStats] = useState<ProviderDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedBookingForDetails, setSelectedBookingForDetails] = useState<BookingData | null>(null);

  const loadDashboardStats = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchProviderDashboardStats(token);
      setStats(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load provider dashboard stats.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDashboardStats();
  }, [loadDashboardStats]);

  const handleBookingUpdated = (updated: BookingData) => {
    setSelectedBookingForDetails(updated);
    // Refresh stats to reflect any state changes
    loadDashboardStats();
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-28 bg-white/70 rounded-3xl border border-dwellio-mint/40" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-white/70 rounded-2xl border border-dwellio-mint/40" />
          ))}
        </div>
        <div className="h-44 bg-white/70 rounded-3xl border border-dwellio-mint/40" />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="p-6 rounded-3xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between">
        <span>{errorMessage}</span>
        <button
          type="button"
          onClick={loadDashboardStats}
          className="px-3 py-1 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-700 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-8">
      {/* Welcome & Earnings Spotlight Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-dwellio-teal to-dwellio-teal/90 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-dwellio-mint bg-white/10 px-3 py-1 rounded-full">
              Operations Center
            </span>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-1">
              Welcome back, {user?.name || 'Partner'}!
            </h2>
            <p className="text-xs sm:text-sm text-dwellio-ivory/80 max-w-xl">
              Track your service performance metrics, daily agenda, and verified customer earnings.
            </p>
          </div>

          {/* Earnings Highlight Box */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20 min-w-[240px] flex-shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-dwellio-mint block">
              Current Month Earnings
            </span>
            <div className="text-3xl font-black text-white mt-0.5">
              ₹{stats.currentMonthEarnings.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-white/80 mt-1 flex items-center justify-between border-t border-white/20 pt-1.5">
              <span>All-Time Recorded:</span>
              <strong className="text-white">₹{stats.totalRecordedEarnings.toLocaleString('en-IN')}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Metric Cards Grid */}
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-dwellio-teal/80 mb-3">
          Performance Metrics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Completed Jobs */}
          <div className="bg-white rounded-2xl p-4 border border-dwellio-mint/60 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Completed</span>
            <div className="text-2xl font-black text-emerald-700 mt-1">
              {stats.totalCompletedJobs}
            </div>
            <span className="text-[10px] text-slate-400">Finished orders</span>
          </div>

          {/* Active Jobs */}
          <div className="bg-white rounded-2xl p-4 border border-dwellio-mint/60 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Active &amp; En Route</span>
            <div className="text-2xl font-black text-sky-700 mt-1">
              {stats.activeJobs}
            </div>
            <span className="text-[10px] text-slate-400">In schedule</span>
          </div>

          {/* Pending Requests */}
          <div className="bg-white rounded-2xl p-4 border border-dwellio-mint/60 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Incoming</span>
            <div className="text-2xl font-black text-amber-600 mt-1">
              {stats.pendingRequests}
            </div>
            <span className="text-[10px] text-slate-400">Awaiting acceptance</span>
          </div>

          {/* Acceptance Rate */}
          <div className="bg-white rounded-2xl p-4 border border-dwellio-mint/60 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Acceptance</span>
            <div className="text-2xl font-black text-dwellio-teal mt-1">
              {stats.acceptanceRate}%
            </div>
            <span className="text-[10px] text-slate-400">Request response</span>
          </div>

          {/* Completion Rate */}
          <div className="bg-white rounded-2xl p-4 border border-dwellio-mint/60 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Completion</span>
            <div className="text-2xl font-black text-dwellio-teal mt-1">
              {stats.completionRate}%
            </div>
            <span className="text-[10px] text-slate-400">Job reliability</span>
          </div>

          {/* Star Rating */}
          <div className="bg-white rounded-2xl p-4 border border-dwellio-mint/60 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Verified Rating</span>
            <div className="text-2xl font-black text-amber-500 mt-1 flex items-center gap-1">
              <span>{stats.ratingAverage > 0 ? stats.ratingAverage.toFixed(1) : '—'}</span>
              <span className="text-base text-amber-500">★</span>
            </div>
            <span className="text-[10px] text-slate-400">{stats.reviewCount} reviews</span>
          </div>
        </div>
      </div>

      {/* Today's Agenda Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-dwellio-teal">
              Today&apos;s Appointments Agenda
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-dwellio-mint/30 text-dwellio-teal border border-dwellio-mint">
              {stats.todaysJobs.length} Today
            </span>
          </div>
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('bookings')}
              className="text-xs font-bold text-dwellio-teal hover:underline"
            >
              View Full Schedule →
            </button>
          )}
        </div>

        {stats.todaysJobs.length === 0 ? (
          <div className="p-8 rounded-3xl bg-white border border-dwellio-mint/60 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-dwellio-ivory text-dwellio-teal flex items-center justify-center text-xl mb-3 border border-dwellio-mint/40">
              ☕
            </div>
            <h4 className="text-base font-bold text-dwellio-teal mb-1">
              No Appointments Scheduled for Today
            </h4>
            <p className="text-xs text-dwellio-teal/70 max-w-sm mx-auto mb-4">
              You are free of scheduled customer visits today. Review upcoming bookings or manage your availability.
            </p>
            {onNavigateTab && (
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigateTab('schedule')}
                  className="px-4 py-2 rounded-xl border border-dwellio-mint bg-dwellio-ivory text-dwellio-teal text-xs font-bold hover:bg-white transition"
                >
                  Manage Availability
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('bookings')}
                  className="px-4 py-2 rounded-xl bg-dwellio-teal text-white text-xs font-bold hover:opacity-95 transition"
                >
                  Check Upcoming Bookings
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {stats.todaysJobs.map((job) => (
              <div
                key={job.id}
                onClick={() => setSelectedBookingForDetails(job)}
                className="bg-white rounded-2xl p-4 border border-dwellio-mint/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:border-dwellio-teal hover:shadow-md transition"
              >
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-slate-400">
                      #{job.id.slice(-6).toUpperCase()}
                    </span>
                    <h4 className="text-sm font-bold text-dwellio-teal">
                      {job.service?.name}
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700">
                      {job.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-dwellio-teal/80">
                    Customer: <strong className="font-semibold">{job.customer?.name}</strong> • 📍 {job.address.street}, {job.address.city}
                  </p>
                  <p className="text-amber-800 font-medium">
                    ⏰ Window: {new Date(job.scheduledStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(job.scheduledEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setSelectedBookingForDetails(job)}
                    className="px-3.5 py-1.5 rounded-xl border border-dwellio-teal/40 text-dwellio-teal text-xs font-bold hover:bg-dwellio-mint/20 transition"
                  >
                    View Job &amp; Route →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Access Tiles */}
      {onNavigateTab && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <button
            type="button"
            onClick={() => onNavigateTab('bookings')}
            className="p-4 rounded-2xl bg-white border border-dwellio-mint/60 text-left hover:border-dwellio-teal hover:shadow-sm transition group"
          >
            <span className="text-lg block mb-1">📋</span>
            <h4 className="text-xs font-bold text-dwellio-teal group-hover:text-dwellio-teal/80">
              Manage Bookings &amp; Jobs
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Respond to requests and progress job status
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('schedule')}
            className="p-4 rounded-2xl bg-white border border-dwellio-mint/60 text-left hover:border-dwellio-teal hover:shadow-sm transition group"
          >
            <span className="text-lg block mb-1">🗓️</span>
            <h4 className="text-xs font-bold text-dwellio-teal group-hover:text-dwellio-teal/80">
              Working Hours &amp; Time Slots
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Configure daily slots and block leave dates
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('reviews')}
            className="p-4 rounded-2xl bg-white border border-dwellio-mint/60 text-left hover:border-dwellio-teal hover:shadow-sm transition group"
          >
            <span className="text-lg block mb-1">⭐</span>
            <h4 className="text-xs font-bold text-dwellio-teal group-hover:text-dwellio-teal/80">
              Verified Reviews Hub
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Read customer feedback and publish replies
            </p>
          </button>
        </div>
      )}

      {/* Job Details Modal */}
      <ProviderJobDetailsModal
        booking={selectedBookingForDetails}
        isOpen={!!selectedBookingForDetails}
        onClose={() => setSelectedBookingForDetails(null)}
        onStatusUpdated={handleBookingUpdated}
      />
    </div>
  );
};

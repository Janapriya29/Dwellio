import React, { useState, useEffect, useCallback } from 'react';
import { BookingData, BookingStatus } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import { fetchCustomerBookings, cancelCustomerBooking } from '../../services/bookingService';

interface MyBookingsViewProps {
  onExploreServices: () => void;
}

const STATUS_FILTERS: { label: string; value?: BookingStatus }[] = [
  { label: 'All Bookings' },
  { label: 'Requested', value: 'requested' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const getStatusBadge = (status: BookingStatus) => {
  switch (status) {
    case 'requested':
      return 'bg-amber-100 text-amber-900 border-amber-300';
    case 'accepted':
      return 'bg-sky-100 text-sky-900 border-sky-300';
    case 'on_the_way':
      return 'bg-purple-100 text-purple-900 border-purple-300';
    case 'in_progress':
      return 'bg-indigo-100 text-indigo-900 border-indigo-300';
    case 'completed':
      return 'bg-emerald-100 text-emerald-900 border-emerald-300';
    case 'cancelled':
      return 'bg-slate-100 text-slate-700 border-slate-300';
    case 'rejected':
      return 'bg-rose-100 text-rose-900 border-rose-300';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-300';
  }
};

export const MyBookingsView: React.FC<MyBookingsViewProps> = ({ onExploreServices }) => {
  const { token, user } = useAuth();
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<BookingStatus | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  const loadBookings = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchCustomerBookings(token, selectedFilter);
      setBookings(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load bookings.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token, selectedFilter]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingBookingId || !token) return;

    setIsCancelling(true);
    try {
      const updated = await cancelCustomerBooking(cancellingBookingId, cancelReason, token);
      setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setCancellingBookingId(null);
      setCancelReason('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel booking.';
      alert(msg);
    } finally {
      setIsCancelling(false);
    }
  };

  const formatSchedule = (startIso: string, endIso: string) => {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const dateStr = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return `${dateStr} • ${timeStr}`;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-dwellio-teal/60">
            Customer Dashboard
          </span>
          <h2 className="text-3xl font-extrabold text-dwellio-teal tracking-tight">
            My Service Bookings
          </h2>
          <p className="text-sm text-dwellio-teal/70 mt-1">
            Tracking requests and active jobs for <strong>{user?.name || 'Customer'}</strong> ({user?.email})
          </p>
        </div>

        <button
          type="button"
          onClick={onExploreServices}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dwellio-teal text-white text-xs font-bold hover:bg-dwellio-teal/90 shadow transition self-start sm:self-auto"
        >
          <span>Explore House Cutaway</span>
          <span>→</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
        {STATUS_FILTERS.map((f, idx) => {
          const isActive = selectedFilter === f.value;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedFilter(f.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
                isActive
                  ? 'bg-dwellio-teal text-white shadow-xs'
                  : 'bg-white text-dwellio-teal/75 border border-dwellio-mint/60 hover:bg-dwellio-ivory'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            onClick={loadBookings}
            className="px-3 py-1 rounded bg-amber-600 text-white font-bold hover:bg-amber-700 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-3xl bg-white/70 border border-dwellio-mint/40 p-6" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !errorMessage && bookings.length === 0 && (
        <div className="text-center py-16 px-6 bg-white rounded-3xl border border-dashed border-dwellio-mint/60 shadow-xs">
          <div className="w-16 h-16 mx-auto rounded-full bg-dwellio-mint/30 flex items-center justify-center text-dwellio-teal mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-dwellio-teal mb-1">
            No Bookings Found
          </h3>
          <p className="text-xs text-dwellio-teal/70 max-w-sm mx-auto mb-6">
            You don&apos;t have any service bookings in this category yet. Explore the interactive house cutaway to discover and schedule verified professionals.
          </p>
          <button
            type="button"
            onClick={onExploreServices}
            className="px-5 py-2.5 rounded-xl bg-[#D9653B] text-white text-xs font-bold hover:bg-[#c4562f] shadow transition"
          >
            Discover Services Now
          </button>
        </div>
      )}

      {/* Booking List */}
      {!isLoading && bookings.length > 0 && (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const canCancel = booking.status === 'requested' || booking.status === 'accepted';
            return (
              <div
                key={booking.id}
                className="bg-white rounded-3xl p-6 border border-dwellio-mint/50 shadow-xs hover:border-dwellio-teal/30 transition"
              >
                {/* Top Row: Service + Status Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-dwellio-mint/30 pb-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-dwellio-teal flex items-center justify-center text-dwellio-mint font-bold text-lg">
                      {booking.service?.name?.charAt(0) || 'S'}
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-dwellio-teal">
                        {booking.service?.name || 'Home Service'}
                      </h4>
                      <p className="text-xs text-dwellio-teal/60">
                        Reference: <span className="font-mono font-bold text-dwellio-teal">{booking.id.slice(-8).toUpperCase()}</span>
                      </p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider border self-start sm:self-auto ${getStatusBadge(
                      booking.status
                    )}`}
                  >
                    {booking.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs mb-4">
                  <div>
                    <span className="font-bold text-dwellio-teal/60 block uppercase text-[10px] mb-0.5">
                      Assigned Professional
                    </span>
                    <span className="font-bold text-dwellio-teal text-sm">
                      {booking.provider?.displayName || 'Verified Technician'}
                    </span>
                    {booking.provider?.phone && (
                      <span className="block text-dwellio-teal/70 mt-0.5">
                        {booking.provider.phone}
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="font-bold text-dwellio-teal/60 block uppercase text-[10px] mb-0.5">
                      Appointment Window
                    </span>
                    <span className="font-medium text-dwellio-teal">
                      {formatSchedule(booking.scheduledStartTime, booking.scheduledEndTime)}
                    </span>
                  </div>

                  <div>
                    <span className="font-bold text-dwellio-teal/60 block uppercase text-[10px] mb-0.5">
                      Service Address
                    </span>
                    <span className="font-medium text-dwellio-teal">
                      {booking.address.street}, {booking.address.city}
                    </span>
                  </div>
                </div>

                {/* Optional Instructions */}
                {booking.customerNotes && (
                  <div className="bg-dwellio-ivory/60 rounded-xl p-3 text-xs text-dwellio-teal/80 border border-dwellio-mint/40 mb-4">
                    <span className="font-bold text-dwellio-teal">Special Instructions:</span> {booking.customerNotes}
                  </div>
                )}

                {/* Status Timeline History */}
                <div className="pt-3 border-t border-dwellio-mint/20">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-dwellio-teal/50 block mb-2">
                    Booking Audit Log
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-dwellio-teal/70">
                    {booking.statusHistory.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="font-semibold capitalize">{step.toStatus.replace(/_/g, ' ')}</span>
                        <span className="text-slate-400">({new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                {canCancel && (
                  <div className="pt-4 mt-4 border-t border-dwellio-mint/20 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setCancellingBookingId(booking.id)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition"
                    >
                      Cancel Booking
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Cancellation Dialog Modal */}
      {cancellingBookingId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dwellio-teal/60 backdrop-blur-xs"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-dwellio-mint">
            <h3 className="text-xl font-bold text-dwellio-teal mb-2">
              Cancel Service Booking?
            </h3>
            <p className="text-xs text-dwellio-teal/70 mb-4 leading-relaxed">
              Are you sure you want to cancel this booking? The slot will be released back into the professional&apos;s available schedule.
            </p>

            <form onSubmit={handleCancelSubmit}>
              <label htmlFor="cancel-reason" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                Reason for Cancellation (Optional)
              </label>
              <textarea
                id="cancel-reason"
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="E.g. Issue resolved independently, or schedule conflict..."
                className="w-full rounded-xl border border-dwellio-mint/80 bg-white p-3 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal mb-4"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCancellingBookingId(null);
                    setCancelReason('');
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Keep Booking
                </button>
                <button
                  type="submit"
                  disabled={isCancelling}
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition disabled:opacity-50"
                >
                  {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

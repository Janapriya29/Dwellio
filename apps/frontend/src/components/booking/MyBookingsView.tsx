import React, { useState, useEffect, useCallback } from 'react';
import { BookingData, BookingStatus, ReviewData } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import { fetchCustomerBookings, cancelCustomerBooking } from '../../services/bookingService';
import { fetchBookingReview } from '../../services/reviewService';
import { ReviewModal } from './ReviewModal';
import { RescheduleModal } from './RescheduleModal';

interface MyBookingsViewProps {
  onExploreServices: () => void;
  onOpenLogin?: () => void;
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

export const MyBookingsView: React.FC<MyBookingsViewProps> = ({ onExploreServices, onOpenLogin }) => {
  const { token, user } = useAuth();
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<BookingStatus | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  const [reviewingBooking, setReviewingBooking] = useState<BookingData | null>(null);
  const [reviewsByBookingId, setReviewsByBookingId] = useState<Record<string, ReviewData>>({});
  const [reschedulingBooking, setReschedulingBooking] = useState<BookingData | null>(null);
  const [rescheduleSuccessBanner, setRescheduleSuccessBanner] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchCustomerBookings(token, selectedFilter);
      setBookings(data);

      // Fetch reviews for any completed bookings
      const completed = data.filter((b) => b.status === 'completed');
      for (const b of completed) {
        fetchBookingReview(b.id, token)
          .then((review) => {
            if (review) {
              setReviewsByBookingId((prev) => ({ ...prev, [b.id]: review }));
            }
          })
          .catch(() => {});
      }
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

  if (!token && !isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-dwellio-teal text-dwellio-mint flex items-center justify-center text-3xl mb-5 shadow-xs">
          📋
        </div>
        <h2 className="text-3xl font-black text-dwellio-teal mb-3 tracking-tight">
          Sign In to View Your Bookings
        </h2>
        <p className="text-sm text-dwellio-teal/70 leading-relaxed max-w-md mx-auto mb-8">
          Review upcoming service appointments, check arrival status, and leave verified reviews for completed jobs.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-sm mx-auto">
          {onOpenLogin && (
            <button
              type="button"
              onClick={onOpenLogin}
              className="w-full py-3 px-5 rounded-xl bg-dwellio-teal text-white font-bold text-sm hover:opacity-95 shadow transition"
            >
              Sign In to Account
            </button>
          )}
          <button
            type="button"
            onClick={onExploreServices}
            className="w-full py-3 px-5 rounded-xl bg-white text-dwellio-teal font-bold text-sm border border-dwellio-mint hover:bg-dwellio-ivory shadow transition"
          >
            Explore Services
          </button>
        </div>
      </div>
    );
  }

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

      {/* Reschedule Success Banner */}
      {rescheduleSuccessBanner && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="text-emerald-600 font-bold text-sm">✅</span>
            <span className="font-medium">{rescheduleSuccessBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setRescheduleSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold p-1"
          >
            ✕
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
            const existingReview = reviewsByBookingId[booking.id];
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

                {/* Review & Feedback Section for Completed Bookings */}
                {booking.status === 'completed' && (
                  <div className="pt-4 mt-4 border-t border-dwellio-mint/20">
                    {existingReview ? (
                      <div className="bg-amber-50/70 rounded-2xl p-4 border border-amber-200/70 text-xs">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-dwellio-teal uppercase text-[10px] tracking-wider">
                              Your Verified Review
                            </span>
                            <div className="flex text-amber-500 font-bold text-sm">
                              {'★'.repeat(existingReview.rating)}
                              <span className="text-slate-300">{'★'.repeat(5 - existingReview.rating)}</span>
                            </div>
                            <span className="font-bold text-dwellio-teal/80 text-[11px]">
                              {existingReview.rating}/5
                            </span>
                          </div>
                          <span className="text-[10px] text-dwellio-teal/60 font-medium">
                            {new Date(existingReview.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        {existingReview.comment ? (
                          <p className="text-dwellio-teal/90 italic leading-relaxed mb-2 bg-white/80 p-3 rounded-xl border border-amber-100">
                            &ldquo;{existingReview.comment}&rdquo;
                          </p>
                        ) : (
                          <p className="text-dwellio-teal/60 italic text-[11px] mb-2">No written feedback provided.</p>
                        )}
                        {existingReview.providerReply && (
                          <div className="mt-3 pl-3 border-l-2 border-dwellio-teal/40 bg-white/90 p-3 rounded-r-xl border border-dwellio-mint/30">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-[10px] uppercase tracking-wider text-dwellio-teal">
                                Professional Response
                              </span>
                              <span className="text-[10px] text-dwellio-teal/60">
                                {new Date(existingReview.providerReply.repliedAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-dwellio-teal text-xs leading-relaxed">
                              {existingReview.providerReply.replyText}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50/80 p-4 rounded-2xl border border-emerald-200/80">
                        <div>
                          <p className="text-xs font-bold text-emerald-950">How was your service experience?</p>
                          <p className="text-[11px] text-emerald-800/80">Share your verified rating and feedback to help your provider and neighbors.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReviewingBooking(booking)}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-dwellio-teal text-white hover:bg-dwellio-teal/90 transition shadow-xs flex items-center justify-center gap-1.5 self-start sm:self-auto shrink-0"
                        >
                          <span className="text-amber-300">★</span>
                          <span>Rate & Review Service</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                {(canCancel) && (
                  <div className="pt-4 mt-4 border-t border-dwellio-mint/20 flex justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setReschedulingBooking(booking)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-sky-800 bg-sky-50 border border-sky-200 hover:bg-sky-100 transition flex items-center gap-1.5"
                    >
                      <span>🔄</span>
                      <span>Reschedule</span>
                    </button>
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

      {/* Reschedule Modal */}
      {reschedulingBooking && (
        <RescheduleModal
          isOpen={!!reschedulingBooking}
          booking={reschedulingBooking}
          onClose={() => setReschedulingBooking(null)}
          onRescheduleSuccess={(updatedBooking) => {
            setBookings((prev) => prev.map((b) => (b.id === updatedBooking.id ? updatedBooking : b)));
            setRescheduleSuccessBanner(`Booking ${updatedBooking.id.slice(-8).toUpperCase()} rescheduled successfully.`);
            setReschedulingBooking(null);
          }}
        />
      )}

      {/* Review Modal */}
      {reviewingBooking && (
        <ReviewModal
          isOpen={!!reviewingBooking}
          booking={reviewingBooking}
          onClose={() => setReviewingBooking(null)}
          onReviewSuccess={(review) => {
            setReviewsByBookingId((prev) => ({ ...prev, [review.bookingId]: review }));
            setReviewingBooking(null);
          }}
        />
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

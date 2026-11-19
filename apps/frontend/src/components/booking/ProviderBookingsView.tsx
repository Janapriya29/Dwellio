import React, { useState, useEffect, useCallback } from 'react';
import { BookingData, ReviewData } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import {
  fetchProviderBookings,
  acceptProviderBooking,
  rejectProviderBooking,
  updateProviderBookingStatus,
} from '../../services/bookingService';
import { fetchBookingReview, replyToReview } from '../../services/reviewService';

const getBookingIdFromHash = (): string | null => {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  const qIdx = hash.indexOf('?');
  if (qIdx === -1) return null;
  const params = new URLSearchParams(hash.slice(qIdx + 1));
  return params.get('bookingId');
};

export const ProviderBookingsView: React.FC = () => {
  const { token, user, switchDemoRole } = useAuth();
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const [rejectingBookingId, setRejectingBookingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const [reviewsByBookingId, setReviewsByBookingId] = useState<Record<string, ReviewData>>({});
  const [replyingReviewId, setReplyingReviewId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  const [isSubmittingReply, setIsSubmittingReply] = useState<boolean>(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [highlightedBookingId, setHighlightedBookingId] = useState<string | null>(() => getBookingIdFromHash());

  // Listen to hash changes (e.g. clicking notification while already on the tab, or browser navigation)
  useEffect(() => {
    const handleHashChange = () => {
      setHighlightedBookingId(getBookingIdFromHash());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Scroll to target booking once data is loaded and apply highlight
  useEffect(() => {
    if (!isLoading && highlightedBookingId && bookings.length > 0) {
      const match = bookings.find((b) => b.id === highlightedBookingId);
      if (match) {
        const timer = setTimeout(() => {
          const el = document.getElementById(`provider-booking-${highlightedBookingId}`);
          if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);

        const clearTimer = setTimeout(() => {
          setHighlightedBookingId(null);
        }, 6000);

        return () => {
          clearTimeout(timer);
          clearTimeout(clearTimer);
        };
      }
    }
  }, [isLoading, highlightedBookingId, bookings]);

  const loadBookings = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchProviderBookings(token);
      setBookings(data);

      const completed = data.filter((b) => b.status === 'completed');
      for (const b of completed) {
        fetchBookingReview(b.id, token)
          .then((rev) => {
            if (rev) {
              setReviewsByBookingId((prev) => ({ ...prev, [b.id]: rev }));
            }
          })
          .catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load provider bookings.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const handleReplySubmit = async (reviewId: string, bookingId: string) => {
    if (!token || !replyText.trim()) return;
    if (replyText.trim().length < 10 || replyText.trim().length > 1000) {
      setReplyError('Reply must be between 10 and 1,000 characters.');
      return;
    }
    setIsSubmittingReply(true);
    setReplyError(null);
    try {
      const updatedReview = await replyToReview(reviewId, { replyText: replyText.trim() }, token);
      setReviewsByBookingId((prev) => ({ ...prev, [bookingId]: updatedReview }));
      setReplyingReviewId(null);
      setReplyText('');
      setActionSuccessMessage('Response published successfully to customer review.');
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish reply.';
      setReplyError(msg);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleAccept = async (id: string) => {
    if (!token) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const updated = await acceptProviderBooking(id, token);
      setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setActionSuccessMessage('Booking accepted successfully! Slot reserved.');
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to accept booking.';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingBookingId || !token) return;

    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const updated = await rejectProviderBooking(rejectingBookingId, rejectReason, token);
      setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setRejectingBookingId(null);
      setRejectReason('');
      setActionSuccessMessage('Booking request declined.');
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to decline booking.';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStatusTransition = async (
    id: string,
    targetStatus: 'on_the_way' | 'in_progress' | 'completed'
  ) => {
    if (!token) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const updated = await updateProviderBookingStatus(id, targetStatus, undefined, token);
      setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setActionSuccessMessage(`Job progress updated to: ${targetStatus.replace(/_/g, ' ')}`);
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update status.';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const incomingRequests = bookings.filter((b) => b.status === 'requested');
  const activeJobs = bookings.filter((b) => ['accepted', 'on_the_way', 'in_progress'].includes(b.status));
  const completedJobs = bookings.filter((b) => ['completed', 'cancelled', 'rejected'].includes(b.status));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-dwellio-mint/30 pb-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-dwellio-teal/60">
            Professional Workspace
          </span>
          <h2 className="text-3xl font-extrabold text-dwellio-teal tracking-tight">
            Provider Booking Management
          </h2>
          <p className="text-sm text-dwellio-teal/70 mt-1">
            Logged in as <strong>{user?.name}</strong> ({user?.role}) • Verified Professional
          </p>
        </div>

        {/* Demo Switcher Quick Buttons */}
        {import.meta.env.DEV && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-dwellio-teal/60">Switch Provider:</span>
            <button
              type="button"
              onClick={() => switchDemoRole('karthik')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-dwellio-mint/80 text-dwellio-teal hover:bg-dwellio-ivory transition"
            >
              Karthik (Roofing)
            </button>
            <button
              type="button"
              onClick={() => switchDemoRole('naveen')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-dwellio-mint/80 text-dwellio-teal hover:bg-dwellio-ivory transition"
            >
              Naveen (Electrical)
            </button>
          </div>
        )}
      </div>

      {/* Action Success Alert */}
      {actionSuccessMessage && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            onClick={loadBookings}
            className="px-3 py-1 rounded bg-rose-600 text-white font-bold hover:bg-rose-700 transition"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-44 bg-white/60 rounded-3xl border border-dwellio-mint/40" />
          <div className="h-44 bg-white/60 rounded-3xl border border-dwellio-mint/40" />
        </div>
      )}

      {!isLoading && (
        <div className="space-y-10">
          {/* Section 1: Incoming Booking Requests */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-bold text-dwellio-teal">
                Incoming Requests
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                {incomingRequests.length} Pending
              </span>
            </div>

            {incomingRequests.length === 0 ? (
              <div className="p-6 bg-white rounded-2xl border border-dwellio-mint/40 text-center text-xs text-dwellio-teal/60">
                No new incoming booking requests at this time.
              </div>
            ) : (
              <div className="space-y-4">
                {incomingRequests.map((req) => {
                  const isHighlighted = highlightedBookingId === req.id;
                  return (
                    <div
                      key={req.id}
                      id={`provider-booking-${req.id}`}
                      data-testid={`provider-booking-${req.id}`}
                      className={`bg-white rounded-3xl p-6 border-2 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition duration-200 ${
                        isHighlighted
                          ? 'border-[#D9653B] ring-4 ring-[#D9653B]/30 shadow-lg'
                          : 'border-amber-200'
                      }`}
                    >
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold text-slate-400">
                          #{req.id.slice(-6).toUpperCase()}
                        </span>
                        <h4 className="text-base font-bold text-dwellio-teal">
                          {req.service?.name}
                        </h4>
                      </div>
                      <p className="text-dwellio-teal/80">
                        Customer: <strong className="font-semibold">{req.customer?.name}</strong> ({req.customer?.email})
                      </p>
                      <p className="text-dwellio-teal/70">
                        📍 {req.address.street}, {req.address.city}
                      </p>
                      <p className="font-medium text-amber-800">
                        ⏰ Window: {new Date(req.scheduledStartTime).toLocaleString()} – {new Date(req.scheduledEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {req.customerNotes && (
                        <p className="bg-dwellio-ivory p-2 rounded-lg text-slate-700 italic">
                          &quot;{req.customerNotes}&quot;
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => setRejectingBookingId(req.id)}
                        className="px-4 py-2 rounded-xl border border-rose-200 text-rose-700 font-bold text-xs hover:bg-rose-50 transition"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleAccept(req.id)}
                        className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow transition flex items-center gap-1.5"
                      >
                        ✓ Accept &amp; Reserve Slot
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>
            )}
          </div>

          {/* Section 2: Active Confirmed Jobs */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-bold text-dwellio-teal">
                Active &amp; En Route Jobs
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-sky-100 text-sky-900 border border-sky-300">
                {activeJobs.length} In Schedule
              </span>
            </div>

            {activeJobs.length === 0 ? (
              <div className="p-6 bg-white rounded-2xl border border-dwellio-mint/40 text-center text-xs text-dwellio-teal/60">
                No active jobs currently in execution.
              </div>
            ) : (
              <div className="space-y-4">
                {activeJobs.map((job) => {
                  const isHighlighted = highlightedBookingId === job.id;
                  return (
                    <div
                      key={job.id}
                      id={`provider-booking-${job.id}`}
                      data-testid={`provider-booking-${job.id}`}
                      className={`bg-white rounded-3xl p-6 border shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition duration-200 ${
                        isHighlighted
                          ? 'border-[#D9653B] ring-4 ring-[#D9653B]/30 shadow-lg'
                          : 'border-dwellio-mint/60'
                      }`}
                    >
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold text-slate-400">
                          #{job.id.slice(-6).toUpperCase()}
                        </span>
                        <h4 className="text-base font-bold text-dwellio-teal">
                          {job.service?.name}
                        </h4>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-900 border border-indigo-200">
                          {job.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-dwellio-teal/80">
                        Customer: <strong className="font-semibold">{job.customer?.name}</strong> • 📍 {job.address.street}, {job.address.city}
                      </p>
                      <p className="text-dwellio-teal/70">
                        Scheduled: {new Date(job.scheduledStartTime).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {job.status === 'accepted' && (
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleStatusTransition(job.id, 'on_the_way')}
                          className="px-4 py-2 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-700 shadow transition"
                        >
                          🚗 Mark On the Way
                        </button>
                      )}

                      {job.status === 'on_the_way' && (
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleStatusTransition(job.id, 'in_progress')}
                          className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 shadow transition"
                        >
                          🔧 Start Work (In Progress)
                        </button>
                      )}

                      {job.status === 'in_progress' && (
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleStatusTransition(job.id, 'completed')}
                          className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow transition"
                        >
                          🏁 Complete Job
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            )}
          </div>

          {/* Section 3: Completed & History */}
          {completedJobs.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-dwellio-teal mb-4">
                Completed &amp; Closed History ({completedJobs.length})
              </h3>
              <div className="space-y-4">
                {completedJobs.map((job) => {
                  const review = reviewsByBookingId[job.id];
                  const isReplying = review && replyingReviewId === review.id;

                  const isHighlighted = highlightedBookingId === job.id;

                  return (
                    <div
                      key={job.id}
                      id={`provider-booking-${job.id}`}
                      data-testid={`provider-booking-${job.id}`}
                      className={`bg-white rounded-3xl p-5 border shadow-xs transition duration-200 ${
                        isHighlighted
                          ? 'border-[#D9653B] ring-4 ring-[#D9653B]/30 shadow-lg'
                          : 'border-dwellio-mint/60'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-dwellio-mint/30 pb-3 mb-3">
                        <div>
                          <span className="font-bold text-dwellio-teal text-sm">{job.service?.name}</span>
                          <span className="text-slate-500 text-xs ml-2">
                            for {job.customer?.name} ({new Date(job.scheduledStartTime).toLocaleDateString()})
                          </span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700 self-start sm:self-auto">
                          {job.status}
                        </span>
                      </div>

                      {/* Customer Review Section */}
                      {job.status === 'completed' && (
                        <div className="mt-2 text-xs">
                          {review ? (
                            <div className="bg-amber-50/60 rounded-2xl p-4 border border-amber-200/60">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-dwellio-teal uppercase text-[10px] tracking-wider">
                                    Customer Review
                                  </span>
                                  <div className="flex text-amber-500 font-bold text-sm">
                                    {'★'.repeat(review.rating)}
                                    <span className="text-slate-300">{'★'.repeat(5 - review.rating)}</span>
                                  </div>
                                  <span className="font-bold text-dwellio-teal/80 text-[11px]">
                                    {review.rating}/5
                                  </span>
                                </div>
                                <span className="text-[10px] text-dwellio-teal/60">
                                  {new Date(review.createdAt).toLocaleDateString()}
                                </span>
                              </div>

                              {review.comment ? (
                                <p className="text-dwellio-teal/90 italic leading-relaxed mb-3 bg-white/80 p-2.5 rounded-xl border border-amber-100">
                                  &ldquo;{review.comment}&rdquo;
                                </p>
                              ) : (
                                <p className="text-dwellio-teal/60 italic text-[11px] mb-2">No written comment provided.</p>
                              )}

                              {/* Provider Reply */}
                              {review.providerReply ? (
                                <div className="mt-2 pl-3 border-l-2 border-dwellio-teal/40 bg-white/90 p-2.5 rounded-r-xl border border-dwellio-mint/30">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-bold text-[10px] uppercase tracking-wider text-dwellio-teal">
                                      Your Public Reply
                                    </span>
                                    <span className="text-[10px] text-dwellio-teal/60">
                                      {new Date(review.providerReply.repliedAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                  <p className="text-dwellio-teal text-xs">
                                    {review.providerReply.replyText}
                                  </p>
                                </div>
                              ) : isReplying ? (
                                <div className="mt-3 bg-white p-3.5 rounded-xl border border-dwellio-teal/30">
                                  <span className="font-bold text-dwellio-teal text-xs block mb-1">
                                    Write a One-Time Public Reply:
                                  </span>
                                  <p className="text-[11px] text-dwellio-teal/60 mb-2">
                                    Your response will be visible on your public reviews profile. You can reply once per verified review.
                                  </p>
                                  <textarea
                                    rows={3}
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Thank the customer or address their feedback professionally (10–1,000 characters)..."
                                    className="w-full rounded-xl border border-dwellio-mint/80 bg-dwellio-ivory/30 p-2.5 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal mb-2"
                                  />
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <span className="text-[10px] text-dwellio-teal/60">
                                      {replyText.trim().length}/1,000 characters (min 10)
                                    </span>
                                    {replyError && (
                                      <span className="text-[11px] text-rose-600 font-semibold">{replyError}</span>
                                    )}
                                    <div className="flex items-center gap-2 self-end sm:self-auto">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setReplyingReviewId(null);
                                          setReplyText('');
                                          setReplyError(null);
                                        }}
                                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isSubmittingReply || replyText.trim().length < 10 || replyText.trim().length > 1000}
                                        onClick={() => handleReplySubmit(review.id, job.id)}
                                        className="px-3 py-1.5 rounded-lg bg-dwellio-teal text-white text-xs font-bold hover:bg-dwellio-teal/90 transition disabled:opacity-50"
                                      >
                                        {isSubmittingReply ? 'Posting...' : 'Post Reply'}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-2 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReplyingReviewId(review.id);
                                      setReplyText('');
                                      setReplyError(null);
                                    }}
                                    className="px-3 py-1.5 rounded-xl border border-dwellio-teal/40 text-dwellio-teal text-xs font-bold hover:bg-dwellio-mint/20 transition"
                                  >
                                    💬 Reply to Customer Review
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-slate-400 italic text-xs py-1">
                              No customer review submitted yet.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Decline Reason Modal */}
      {rejectingBookingId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dwellio-teal/60 backdrop-blur-xs"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-dwellio-mint">
            <h3 className="text-xl font-bold text-dwellio-teal mb-2">
              Decline Booking Request
            </h3>
            <p className="text-xs text-dwellio-teal/70 mb-4">
              Please state why you are unable to accept this appointment:
            </p>

            <form onSubmit={handleRejectSubmit}>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="E.g. Fully booked or outside operating zone..."
                className="w-full rounded-xl border border-dwellio-mint/80 bg-white p-3 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal mb-4"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRejectingBookingId(null);
                    setRejectReason('');
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition"
                >
                  Confirm Decline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

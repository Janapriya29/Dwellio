import React, { useState, useEffect, useCallback } from 'react';
import { BookingData } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import {
  fetchProviderBookings,
  acceptProviderBooking,
  rejectProviderBooking,
  updateProviderBookingStatus,
} from '../../services/bookingService';

export const ProviderBookingsView: React.FC = () => {
  const { token, user, switchDemoRole } = useAuth();
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const [rejectingBookingId, setRejectingBookingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const loadBookings = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchProviderBookings(token);
      setBookings(data);
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
                {incomingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-white rounded-3xl p-6 border-2 border-amber-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
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
                ))}
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
                {activeJobs.map((job) => (
                  <div
                    key={job.id}
                    className="bg-white rounded-3xl p-6 border border-dwellio-mint/60 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
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
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Completed & History */}
          {completedJobs.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-dwellio-teal mb-4">
                Completed &amp; Closed History ({completedJobs.length})
              </h3>
              <div className="space-y-3">
                {completedJobs.map((job) => (
                  <div
                    key={job.id}
                    className="bg-white/80 rounded-2xl p-4 border border-slate-200 text-xs flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-dwellio-teal">{job.service?.name}</span>
                      <span className="text-slate-500 ml-2">for {job.customer?.name} ({new Date(job.scheduledStartTime).toLocaleDateString()})</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                      {job.status}
                    </span>
                  </div>
                ))}
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

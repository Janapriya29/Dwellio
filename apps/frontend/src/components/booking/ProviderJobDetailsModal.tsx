import React, { useState, useEffect } from 'react';
import { BookingData, BookingStatus } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import {
  acceptProviderBooking,
  rejectProviderBooking,
  updateProviderBookingStatus,
  cancelProviderBooking,
} from '../../services/bookingService';
import { BookingChatDrawer } from '../chat/BookingChatDrawer';

export interface ProviderJobDetailsModalProps {
  booking: BookingData | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdated: (updatedBooking: BookingData) => void;
}

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

export const ProviderJobDetailsModal: React.FC<ProviderJobDetailsModalProps> = ({
  booking,
  isOpen,
  onClose,
  onStatusUpdated,
}) => {
  const { token, user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Cancellation dialog state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Rejection dialog state
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setShowCancelDialog(false);
      setCancelReason('');
      setShowRejectDialog(false);
      setRejectReason('');
    }
  }, [isOpen, booking]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !booking) return null;

  const customerName = booking.customer?.name || 'Customer';
  const customerEmail = booking.customer?.email || '';
  const customerPhone = booking.customer?.phone || booking.provider?.phone || '';
  const cleanPhone = customerPhone.replace(/[^0-9+]/g, '');
  const waPhone = cleanPhone.replace(/^0+/, '').replace(/^\+/, '');

  const fullAddress = `${booking.address.street}, ${booking.address.city}${
    booking.address.postalCode ? ' ' + booking.address.postalCode : ''
  }`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    fullAddress
  )}`;

  const waGreeting = `Hello ${customerName}, I am ${
    booking.provider?.displayName || 'your service professional'
  } regarding your Dwellio booking (#${booking.id.slice(-6).toUpperCase()}) for ${
    booking.service?.name || 'service'
  }.`;
  const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(waGreeting)}`;

  // Status transitions
  const handleAccept = async () => {
    if (!token) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const updated = await acceptProviderBooking(booking.id, token);
      onStatusUpdated(updated);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to accept booking.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!token) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const updated = await rejectProviderBooking(booking.id, rejectReason.trim() || undefined, token);
      onStatusUpdated(updated);
      setShowRejectDialog(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to decline booking.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStatusChange = async (nextStatus: 'on_the_way' | 'in_progress' | 'completed') => {
    if (!token) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const updated = await updateProviderBookingStatus(booking.id, nextStatus, undefined, token);
      onStatusUpdated(updated);
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to update status to ${nextStatus}.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!token) return;
    if (cancelReason.trim().length < 5) {
      setErrorMessage('Please provide a cancellation reason (minimum 5 characters).');
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const updated = await cancelProviderBooking(booking.id, cancelReason.trim(), token);
      onStatusUpdated(updated);
      setShowCancelDialog(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to cancel booking.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dwellio-teal/60 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-details-modal-title"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-dwellio-mint/40 overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-dwellio-teal text-white flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-dwellio-mint bg-white/10 px-2 py-0.5 rounded-md">
                #{booking.id.slice(-6).toUpperCase()}
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${getStatusBadge(
                  booking.status
                )}`}
              >
                {booking.status.replace(/_/g, ' ')}
              </span>
            </div>
            <h2 id="job-details-modal-title" className="text-lg font-bold mt-1 text-white">
              {booking.service?.name || 'Assigned Home Service'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs text-dwellio-teal">
          {/* Error Banner */}
          {errorMessage && (
            <div
              className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold"
              role="alert"
            >
              ⚠️ {errorMessage}
            </div>
          )}

          {/* Customer & Direct Communication Box */}
          <div className="p-5 rounded-2xl bg-dwellio-ivory border border-dwellio-mint/60 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-dwellio-mint/30 pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-dwellio-teal/60 block">
                  Customer &amp; Contact
                </span>
                <span className="text-sm font-bold text-dwellio-teal block">
                  {customerName}
                </span>
                <span className="text-[11px] text-dwellio-teal/70">
                  {customerEmail}
                </span>
              </div>

              {customerPhone && (
                <div className="text-sm font-mono font-bold text-dwellio-teal bg-white px-3 py-1 rounded-xl border border-dwellio-mint/50 self-start sm:self-auto">
                  📞 {customerPhone}
                </div>
              )}
            </div>

            {/* Direct 1-Tap Communication Shortcuts */}
            <div>
              <span className="text-[10px] uppercase font-bold text-dwellio-teal/60 block mb-2">
                Direct Contact Actions
              </span>
              <div className="flex flex-wrap gap-2">
                {cleanPhone ? (
                  <>
                    <a
                      href={`tel:${cleanPhone}`}
                      className="px-3.5 py-1.5 rounded-xl bg-white border border-dwellio-teal/30 font-bold hover:bg-dwellio-mint/20 transition flex items-center gap-1.5 text-dwellio-teal"
                    >
                      <span>📞</span> Call Customer
                    </a>
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-300 font-bold text-emerald-800 hover:bg-emerald-100 transition flex items-center gap-1.5"
                    >
                      <span>💬</span> WhatsApp
                    </a>
                    <a
                      href={`sms:${cleanPhone}`}
                      className="px-3.5 py-1.5 rounded-xl bg-white border border-dwellio-teal/30 font-bold hover:bg-dwellio-mint/20 transition flex items-center gap-1.5 text-dwellio-teal"
                    >
                      <span>✉️</span> SMS
                    </a>
                  </>
                ) : (
                  <span className="text-slate-400 italic">
                    Contact number will be available upon customer confirmation.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Location & Navigation */}
          <div className="p-4 rounded-2xl bg-white border border-dwellio-mint/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-dwellio-teal/60">
                Service Address &amp; Directions
              </span>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-800 border border-sky-200 font-bold text-[11px] hover:bg-sky-100 transition flex items-center gap-1"
              >
                <span>🗺️</span> Open Google Maps
              </a>
            </div>
            <p className="font-semibold text-dwellio-teal text-sm">
              📍 {fullAddress}
            </p>
            {booking.address.landmark && (
              <p className="text-dwellio-teal/70">
                Landmark: <strong>{booking.address.landmark}</strong>
              </p>
            )}
          </div>

          {/* Schedule Window & Rescheduling Notice */}
          <div className="p-4 rounded-2xl bg-white border border-dwellio-mint/50 space-y-2">
            <span className="text-[10px] uppercase font-bold text-dwellio-teal/60 block">
              Appointment Timing
            </span>
            <p className="font-bold text-sm text-dwellio-teal">
              ⏰ {new Date(booking.scheduledStartTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} |{' '}
              {new Date(booking.scheduledStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
              {new Date(booking.scheduledEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>

            {/* Customer Special Instructions */}
            {booking.customerNotes && (
              <div className="mt-2 p-2.5 bg-dwellio-ivory rounded-xl border border-dwellio-mint/40">
                <span className="text-[10px] uppercase font-bold text-dwellio-teal/60 block mb-0.5">
                  Customer Instructions:
                </span>
                <p className="italic text-slate-700">&quot;{booking.customerNotes}&quot;</p>
              </div>
            )}
          </div>

          {/* Status Timeline */}
          <div className="p-4 rounded-2xl bg-white border border-dwellio-mint/50 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-dwellio-teal/80">
              Booking Status History Timeline
            </h4>
            <div className="space-y-2 relative border-l-2 border-dwellio-mint/50 ml-2 pl-4">
              {(booking.statusHistory || []).map((h, idx) => {
                const toStatus = h.toStatus || (h as any).status || '';
                const toStatusDisplay = toStatus ? toStatus.replace(/_/g, ' ') : 'Status update';
                const actorRole = h.actorRole || (h as any).actorRole || 'user';
                const reasonText = h.reason || (h as any).note;
                return (
                  <div key={idx} className="relative">
                    <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-dwellio-teal border-2 border-white" />
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-dwellio-teal capitalize">
                        {toStatusDisplay}
                      </span>
                      <span className="text-[10px] text-dwellio-teal/60">
                        {new Date(h.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    <span className="text-[10px] text-dwellio-teal/60 block">
                      Actor: <span className="capitalize">{actorRole}</span>
                      {reasonText ? ` • "${reasonText}"` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cancellation or Decline Reason Details if Applicable */}
          {booking.cancellationReason && (
            <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-300 text-slate-800">
              <strong>Cancellation Reason:</strong> {booking.cancellationReason}
            </div>
          )}

          {booking.rejectionReason && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800">
              <strong>Decline Reason:</strong> {booking.rejectionReason}
            </div>
          )}

          {/* Cancellation Dialog Overlay */}
          {showCancelDialog && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-3">
              <h4 className="font-bold text-rose-900 text-sm">
                Cancel Booking #{booking.id.slice(-6).toUpperCase()}
              </h4>
              <p className="text-[11px] text-rose-700">
                Please provide a clear reason for cancellation. The customer will be immediately notified and any held time slots will be released.
              </p>
              <textarea
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Schedule emergency, required parts out of stock..."
                className="w-full px-3 py-2 rounded-xl border border-rose-300 bg-white text-xs text-rose-900 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
              <div className="flex gap-1.5 flex-wrap">
                {[
                  'Customer requested cancellation',
                  'Emergency schedule conflict',
                  'Outside service scope',
                  'Customer unreachable at location',
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setCancelReason(chip)}
                    className="px-2 py-0.5 rounded-md bg-white border border-rose-200 text-[10px] text-rose-800 hover:bg-rose-100 transition"
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelDialog(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Keep Booking
                </button>
                <button
                  type="button"
                  disabled={isProcessing || cancelReason.trim().length < 5}
                  onClick={handleCancel}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 transition disabled:opacity-50"
                >
                  {isProcessing ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </div>
          )}

          {/* Decline Dialog Overlay */}
          {showRejectDialog && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
              <h4 className="font-bold text-amber-900 text-sm">
                Decline Request #{booking.id.slice(-6).toUpperCase()}
              </h4>
              <textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for declining (e.g. fully booked, out of service zone)..."
                className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-xs text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRejectDialog(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleReject}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 transition disabled:opacity-50"
                >
                  {isProcessing ? 'Declining...' : 'Confirm Decline'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="px-6 py-4 bg-dwellio-ivory border-t border-dwellio-mint/40 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsChatOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 font-bold text-xs transition flex items-center gap-1.5"
            >
              <span>💬</span>
              <span>Chat with Customer</span>
            </button>
            {['accepted', 'on_the_way', 'in_progress'].includes(booking.status) && !showCancelDialog && (
              <button
                type="button"
                onClick={() => setShowCancelDialog(true)}
                className="px-3 py-1.5 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 font-bold text-xs transition"
              >
                Cancel Booking
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50 transition text-xs"
            >
              Close
            </button>

            {/* Requested State Actions */}
            {booking.status === 'requested' && !showRejectDialog && (
              <>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => setShowRejectDialog(true)}
                  className="px-4 py-2 rounded-xl border border-rose-300 text-rose-700 font-bold text-xs hover:bg-rose-50 transition"
                >
                  Decline
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleAccept}
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow transition flex items-center gap-1.5"
                >
                  {isProcessing ? 'Accepting...' : '✓ Accept & Reserve Slot'}
                </button>
              </>
            )}

            {/* Active Progression Actions */}
            {booking.status === 'accepted' && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleStatusChange('on_the_way')}
                className="px-5 py-2 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-700 shadow transition"
              >
                {isProcessing ? 'Updating...' : '🚗 Mark On The Way'}
              </button>
            )}

            {booking.status === 'on_the_way' && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleStatusChange('in_progress')}
                className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 shadow transition"
              >
                {isProcessing ? 'Updating...' : '🔧 Start Work (In Progress)'}
              </button>
            )}

            {booking.status === 'in_progress' && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleStatusChange('completed')}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow transition"
              >
                {isProcessing ? 'Completing...' : '🏁 Complete Job'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Customer Messaging Drawer (Milestone 5B) */}
      {isChatOpen && (
        <BookingChatDrawer
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          bookingId={booking.id}
          token={token || ''}
          currentUserId={user?.id || ''}
          bookingTitle={booking.service?.name || 'Service Job'}
          counterpartName={booking.customer?.name || 'Customer'}
          counterpartRole="customer"
        />
      )}
    </div>
  );
};

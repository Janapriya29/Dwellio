import React, { useState, useEffect } from 'react';
import type { BookingData, StandardTimeSlotDefinition, ProviderSlotAvailability } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import { rescheduleCustomerBooking } from '../../services/bookingService';
import { fetchProviderAvailability } from '../../services/catalogService';

export const STANDARD_TIME_SLOTS: StandardTimeSlotDefinition[] = [
  { slotIndex: 0, label: '09:00 AM – 11:00 AM', startHour: 9, startMin: 0, endHour: 11, endMin: 0 },
  { slotIndex: 1, label: '11:30 AM – 01:30 PM', startHour: 11, startMin: 30, endHour: 13, endMin: 30 },
  { slotIndex: 2, label: '02:00 PM – 04:00 PM', startHour: 14, startMin: 0, endHour: 16, endMin: 0 },
  { slotIndex: 3, label: '04:30 PM – 06:30 PM', startHour: 16, startMin: 30, endHour: 18, endMin: 30 },
];

export interface RescheduleModalProps {
  isOpen: boolean;
  booking: BookingData;
  onClose: () => void;
  onRescheduleSuccess: (updatedBooking: BookingData) => void;
}

export const RescheduleModal: React.FC<RescheduleModalProps> = ({
  isOpen,
  booking,
  onClose,
  onRescheduleSuccess,
}) => {
  const { token } = useAuth();

  // Tomorrow's date formatted as YYYY-MM-DD
  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  const [selectedDate, setSelectedDate] = useState<string>(tomorrowStr);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0);
  const [reason, setReason] = useState<string>('');

  const [slotsAvailability, setSlotsAvailability] = useState<ProviderSlotAvailability[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchAvailability = (providerId: string, dateStr: string) => {
    setIsLoadingAvailability(true);
    fetchProviderAvailability(providerId, dateStr)
      .then((data) => {
        setSlotsAvailability(data.slots || []);
      })
      .catch(() => {
        setSlotsAvailability([]);
      })
      .finally(() => {
        setIsLoadingAvailability(false);
      });
  };

  useEffect(() => {
    if (!isOpen || !booking.providerId || !selectedDate) return;
    fetchAvailability(booking.providerId, selectedDate);
  }, [isOpen, booking.providerId, selectedDate]);

  if (!isOpen) return null;

  const effectiveSlots = STANDARD_TIME_SLOTS.map((def) => {
    const remote = slotsAvailability.find((s) => s.slotIndex === def.slotIndex);
    return {
      slotIndex: def.slotIndex,
      label: def.label,
      startHour: def.startHour,
      startMin: def.startMin,
      endHour: def.endHour,
      endMin: def.endMin,
      isAvailable: remote ? remote.isAvailable : true,
      reason: remote?.reason,
    };
  });

  const selectedSlot = effectiveSlots.find((s) => s.slotIndex === selectedSlotIndex) || effectiveSlots[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedSlot.isAvailable) {
      setErrorMessage('The selected appointment time is unavailable. Please choose an open slot.');
      return;
    }

    const [year, month, day] = selectedDate.split('-').map(Number);
    const startTime = new Date(year, month - 1, day, selectedSlot.startHour, selectedSlot.startMin, 0, 0);
    const endTime = new Date(year, month - 1, day, selectedSlot.endHour, selectedSlot.endMin, 0, 0);

    if (startTime.getTime() <= Date.now()) {
      setErrorMessage('The rescheduled appointment window must be in the future.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await rescheduleCustomerBooking(
        booking.id,
        {
          newStartTime: startTime.toISOString(),
          newEndTime: endTime.toISOString(),
          reason: reason.trim() || undefined,
        },
        token || ''
      );

      onRescheduleSuccess(updated);
      onClose();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Failed to reschedule booking.';
      setErrorMessage(msg);
      // If 409 conflict, refresh provider availability
      if (err.status === 409 || msg.toLowerCase().includes('conflict') || msg.toLowerCase().includes('available')) {
        fetchAvailability(booking.providerId, selectedDate);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatSchedule = (startIso: string, endIso: string) => {
    try {
      const start = new Date(startIso);
      const end = new Date(endIso);
      const dateStr = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      return `${dateStr} • ${timeStr}`;
    } catch {
      return `${startIso} – ${endIso}`;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reschedule-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dwellio-teal/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-dwellio-mint my-8 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-dwellio-mint/40 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center text-lg font-bold">
              🔄
            </span>
            <div>
              <h3 id="reschedule-modal-title" className="text-xl font-black text-dwellio-teal">
                Reschedule Appointment
              </h3>
              <p className="text-xs text-dwellio-teal/70">
                Booking Reference: <span className="font-mono font-bold text-dwellio-teal">{booking.id.slice(-8).toUpperCase()}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-dwellio-teal/50 hover:text-dwellio-teal p-1.5 rounded-xl hover:bg-dwellio-ivory transition"
            aria-label="Close reschedule dialog"
          >
            ✕
          </button>
        </div>

        {/* Current Schedule Summary */}
        <div className="bg-dwellio-ivory/80 rounded-2xl p-4 border border-dwellio-mint/60 mb-5 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-dwellio-teal/60 font-medium">Service:</span>
            <span className="font-bold text-dwellio-teal">{booking.service?.name || 'Home Service'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dwellio-teal/60 font-medium">Professional:</span>
            <span className="font-bold text-dwellio-teal">{booking.provider?.displayName || 'Assigned Specialist'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dwellio-teal/60 font-medium">Current Schedule:</span>
            <span className="font-semibold text-dwellio-teal/80">{formatSchedule(booking.scheduledStartTime, booking.scheduledEndTime)}</span>
          </div>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="mb-5 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <span className="text-base leading-none">⚠️</span>
            <div className="flex-1 font-medium">{errorMessage}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Date Picker */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="reschedule-date" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider">
                Select New Date *
              </label>
              {isLoadingAvailability && (
                <span className="text-[11px] text-sky-700 font-medium flex items-center gap-1 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />
                  Checking availability...
                </span>
              )}
            </div>
            <input
              id="reschedule-date"
              type="date"
              min={tomorrowStr}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              required
              className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3.5 py-2.5 text-xs text-dwellio-teal font-medium focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
            />
          </div>

          {/* Time Slot Selection */}
          <div>
            <label className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-2">
              Preferred Time Slot *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {effectiveSlots.map((slot) => {
                const isSelected = selectedSlotIndex === slot.slotIndex;
                const isAvailable = slot.isAvailable;

                return (
                  <button
                    key={slot.slotIndex}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => setSelectedSlotIndex(slot.slotIndex)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold text-center border transition ${
                      !isAvailable
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed line-through'
                        : isSelected
                        ? 'bg-dwellio-teal text-white border-dwellio-teal shadow-xs'
                        : 'bg-dwellio-ivory/60 text-dwellio-teal/80 border-dwellio-mint/60 hover:bg-white'
                    }`}
                    title={!isAvailable ? `Slot unavailable (${slot.reason || 'Booked'})` : slot.label}
                  >
                    {slot.label}
                    {!isAvailable && (
                      <span className="block text-[9px] no-underline font-normal text-rose-600 mt-0.5">
                        Unavailable
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reason Input */}
          <div>
            <label htmlFor="reschedule-reason" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1">
              Reason for Rescheduling (Optional)
            </label>
            <textarea
              id="reschedule-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="E.g. Travel delay, personal schedule change..."
              className="w-full rounded-xl border border-dwellio-mint/80 bg-white p-3 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-dwellio-mint/30">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedSlot.isAvailable}
              className="px-5 py-2 rounded-xl bg-dwellio-teal text-white text-xs font-bold hover:bg-dwellio-teal/90 transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Rescheduling...</span>
                </>
              ) : (
                'Confirm Reschedule'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

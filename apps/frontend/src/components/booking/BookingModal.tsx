import React, { useState } from 'react';
import { PublicProviderData, ServiceData, BookingData, HouseRoom } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import { createBooking } from '../../services/bookingService';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: PublicProviderData;
  services: ServiceData[];
  selectedRoom?: HouseRoom;
  onBookingSuccess?: (booking: BookingData) => void;
}

const TIME_SLOTS = [
  { label: '09:00 AM – 11:00 AM', startHour: 9, startMin: 0, endHour: 11, endMin: 0 },
  { label: '11:30 AM – 01:30 PM', startHour: 11, startMin: 30, endHour: 13, endMin: 30 },
  { label: '02:00 PM – 04:00 PM', startHour: 14, startMin: 0, endHour: 16, endMin: 0 },
  { label: '04:30 PM – 06:30 PM', startHour: 16, startMin: 30, endHour: 18, endMin: 30 },
];

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  provider,
  services,
  onBookingSuccess,
}) => {
  const { token } = useAuth();

  // Tomorrow's date formatted as YYYY-MM-DD
  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    services.length > 0 ? services[0].id : ''
  );
  const [selectedDate, setSelectedDate] = useState<string>(tomorrowStr);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0);
  const [street, setStreet] = useState<string>('42 Palm Avenue, Apt 3B');
  const [city, setCity] = useState<string>('Chennai');
  const [postalCode, setPostalCode] = useState<string>('600028');
  const [customerNotes, setCustomerNotes] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<BookingData | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedServiceId) {
      setErrorMessage('Please select a service offering.');
      return;
    }

    if (!street.trim() || !city.trim()) {
      setErrorMessage('Street address and city are required.');
      return;
    }

    const slot = TIME_SLOTS[selectedSlotIndex];
    const [year, month, day] = selectedDate.split('-').map(Number);

    // Wall-clock time: construct local browser Date so appointment matches customer's selected time.
    // .toISOString() will accurately convert this local instant into UTC ISO 8601 for backend storage.
    const startTime = new Date(year, month - 1, day, slot.startHour, slot.startMin, 0, 0);
    const endTime = new Date(year, month - 1, day, slot.endHour, slot.endMin, 0, 0);

    if (startTime.getTime() <= Date.now()) {
      setErrorMessage('The scheduled appointment window must be in the future.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newBooking = await createBooking(
        {
          serviceId: selectedServiceId,
          providerId: provider.id,
          scheduledStartTime: startTime.toISOString(),
          scheduledEndTime: endTime.toISOString(),
          address: {
            street: street.trim(),
            city: city.trim(),
            postalCode: postalCode.trim() || undefined,
          },
          customerNotes: customerNotes.trim() || undefined,
        },
        token || ''
      );

      setConfirmedBooking(newBooking);
      if (onBookingSuccess) {
        onBookingSuccess(newBooking);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to schedule booking.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dwellio-teal/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-dwellio-mint my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Success Confirmation Screen */}
        {confirmedBooking ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 id="booking-modal-title" className="text-2xl font-bold text-dwellio-teal mb-2">
              Booking Request Submitted!
            </h3>
            <p className="text-sm text-dwellio-teal/70 max-w-sm mx-auto mb-6">
              Your service request has been sent to <strong>{provider.displayName}</strong>. You will be notified once accepted.
            </p>

            <div className="bg-dwellio-ivory rounded-2xl p-4 text-left border border-dwellio-mint/60 mb-6 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-dwellio-teal/60">Booking ID:</span>
                <span className="font-mono font-bold text-dwellio-teal">{confirmedBooking.id.slice(-8).toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dwellio-teal/60">Professional:</span>
                <span className="font-bold text-dwellio-teal">{provider.displayName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dwellio-teal/60">Status:</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold uppercase text-[10px]">
                  {confirmedBooking.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-dwellio-teal/60">Scheduled Window:</span>
                <span className="font-medium text-dwellio-teal">
                  {new Date(confirmedBooking.scheduledStartTime).toLocaleDateString()} • {TIME_SLOTS[selectedSlotIndex].label}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-dwellio-teal/60">Service Address:</span>
                <span className="font-medium text-dwellio-teal">{street}, {city}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex items-center justify-center px-5 py-3 rounded-xl bg-dwellio-teal text-white font-bold text-sm hover:bg-dwellio-teal/90 shadow transition"
            >
              Done &amp; View Bookings
            </button>
          </div>
        ) : (
          /* Real Functional Booking Form */
          <form onSubmit={handleSubmit}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-dwellio-mint/30 pb-4 mb-5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-dwellio-teal/60">
                  Schedule Service Appointment
                </span>
                <h3 id="booking-modal-title" className="text-xl sm:text-2xl font-black text-dwellio-teal">
                  Book {provider.displayName}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition"
                aria-label="Close booking modal"
              >
                ✕
              </button>
            </div>

            {/* Provider quick summary */}
            <div className="bg-dwellio-ivory rounded-2xl p-3.5 mb-5 border border-dwellio-mint/60 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-dwellio-teal">{provider.displayName}</p>
                <p className="text-[11px] text-dwellio-teal/60">{provider.skills.join(', ')} • {provider.serviceArea}</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                4/4 Verified
              </span>
            </div>

            {/* Error banner */}
            {errorMessage && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                {errorMessage}
              </div>
            )}

            {/* Service Selection */}
            <div className="mb-4">
              <label htmlFor="service-select" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1.5">
                Service Specialty *
              </label>
              <select
                id="service-select"
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3.5 py-2.5 text-xs text-dwellio-teal font-medium focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Selection */}
            <div className="mb-4">
              <label htmlFor="booking-date" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1.5">
                Appointment Date *
              </label>
              <input
                id="booking-date"
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                required
                className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3.5 py-2.5 text-xs text-dwellio-teal font-medium focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
              />
            </div>

            {/* Time Slot Selection */}
            <div className="mb-4">
              <span className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1.5">
                Preferred Time Slot *
              </span>
              <div className="grid grid-cols-2 gap-2">
                {TIME_SLOTS.map((slot, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedSlotIndex(idx)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold text-center border transition ${
                      selectedSlotIndex === idx
                        ? 'bg-dwellio-teal text-white border-dwellio-teal shadow-xs'
                        : 'bg-dwellio-ivory/60 text-dwellio-teal/80 border-dwellio-mint/60 hover:bg-white'
                    }`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Address */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="col-span-2">
                <label htmlFor="street-input" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                  Street Address *
                </label>
                <input
                  id="street-input"
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  required
                  placeholder="Door/Flat No., Street Name"
                  className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3.5 py-2 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                />
              </div>
              <div>
                <label htmlFor="city-input" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                  City *
                </label>
                <input
                  id="city-input"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                  placeholder="City"
                  className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3.5 py-2 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                />
              </div>
              <div>
                <label htmlFor="postal-input" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                  Postal Code
                </label>
                <input
                  id="postal-input"
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="PIN / ZIP"
                  className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3.5 py-2 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                />
              </div>
            </div>

            {/* Customer Notes */}
            <div className="mb-6">
              <label htmlFor="notes-input" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                Instructions for Technician (Optional)
              </label>
              <textarea
                id="notes-input"
                rows={2}
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="E.g. Switchboard in master bedroom sparks when AC turns on..."
                className="w-full rounded-xl border border-dwellio-mint/80 bg-white p-3 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
              />
            </div>

            {/* Submit & Cancel */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-dwellio-mint/30">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-[#D9653B] text-white text-xs font-bold hover:bg-[#c4562f] shadow transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting Request...
                  </>
                ) : (
                  'Confirm & Request Booking'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

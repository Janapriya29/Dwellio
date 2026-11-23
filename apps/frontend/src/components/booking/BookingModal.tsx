import React, { useState, useEffect } from 'react';
import type {
  PublicProviderData,
  ServiceData,
  BookingData,
  HouseRoom,
  StandardTimeSlotDefinition,
  ProviderSlotAvailability,
  CustomerSavedAddress,
  ValidateCouponResponseData,
} from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import { createBooking } from '../../services/bookingService';
import { fetchProviderAvailability } from '../../services/catalogService';
import { getSavedAddresses, saveAddress } from '../../services/addressBookService';
import { validateCoupon } from '../../services/couponService';

export const STANDARD_TIME_SLOTS: StandardTimeSlotDefinition[] = [
  { slotIndex: 0, label: '09:00 AM – 11:00 AM', startHour: 9, startMin: 0, endHour: 11, endMin: 0 },
  { slotIndex: 1, label: '11:30 AM – 01:30 PM', startHour: 11, startMin: 30, endHour: 13, endMin: 30 },
  { slotIndex: 2, label: '02:00 PM – 04:00 PM', startHour: 14, startMin: 0, endHour: 16, endMin: 0 },
  { slotIndex: 3, label: '04:30 PM – 06:30 PM', startHour: 16, startMin: 30, endHour: 18, endMin: 30 },
];

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: PublicProviderData;
  services: ServiceData[];
  selectedRoom?: HouseRoom;
  onBookingSuccess?: (booking: BookingData) => void;
  onNavigateToBookings?: () => void;
}

const STORAGE_KEY_ADDRESS = 'dwellio_customer_address';

const getSavedAddress = (): { street: string; city: string; postalCode: string } => {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_ADDRESS) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        street: typeof parsed.street === 'string' ? parsed.street : '',
        city: typeof parsed.city === 'string' ? parsed.city : '',
        postalCode: typeof parsed.postalCode === 'string' ? parsed.postalCode : '',
      };
    }
  } catch {
    // ignore localStorage parse errors
  }
  return { street: '', city: '', postalCode: '' };
};

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  provider,
  services,
  onBookingSuccess,
  onNavigateToBookings,
}) => {
  const { token, user } = useAuth();

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

  // Address book state
  const [savedAddresses, setSavedAddresses] = useState<CustomerSavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('new');
  const [saveToAddressBook, setSaveToAddressBook] = useState<boolean>(true);
  const [newAddressLabel, setNewAddressLabel] = useState<string>('Home');

  // Address form fields
  const initialAddress = getSavedAddress();
  const [street, setStreet] = useState<string>(initialAddress.street);
  const [city, setCity] = useState<string>(initialAddress.city);
  const [postalCode, setPostalCode] = useState<string>(initialAddress.postalCode);
  const [customerNotes, setCustomerNotes] = useState<string>('');

  // Dynamic slot availability state
  const [slotsAvailability, setSlotsAvailability] = useState<ProviderSlotAvailability[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<BookingData | null>(null);

  // Coupon state
  const [couponCodeInput, setCouponCodeInput] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<ValidateCouponResponseData | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState<boolean>(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const selectedService = services.find((s) => s.id === selectedServiceId);
  const baseServicePrice = selectedService?.basePrice || 499;

  const handleApplyCoupon = async () => {
    if (!couponCodeInput.trim() || !token) return;
    setIsValidatingCoupon(true);
    setCouponError(null);
    try {
      const res = await validateCoupon(
        {
          code: couponCodeInput.trim(),
          bookingAmountRupees: baseServicePrice,
        },
        token
      );
      setAppliedCoupon(res);
    } catch (err: any) {
      setCouponError(err.message || 'Invalid or expired coupon code.');
      setAppliedCoupon(null);
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCodeInput('');
    setCouponError(null);
  };

  // Load saved addresses on modal open
  useEffect(() => {
    if (isOpen) {
      const list = getSavedAddresses(user?.id);
      setSavedAddresses(list);
      if (list.length > 0) {
        const defaultAddr = list.find((a) => a.isDefault) || list[0];
        setSelectedAddressId(defaultAddr.id);
        setStreet(defaultAddr.street);
        setCity(defaultAddr.city);
        setPostalCode(defaultAddr.postalCode || '');
        setSaveToAddressBook(false);
      } else {
        setSelectedAddressId('new');
        const legacy = getSavedAddress();
        setStreet(legacy.street);
        setCity(legacy.city);
        setPostalCode(legacy.postalCode);
        setSaveToAddressBook(true);
      }
    }
  }, [isOpen, user?.id]);

  // Fetch real-time provider availability whenever date or provider changes
  useEffect(() => {
    if (!isOpen || !provider?.id || !selectedDate) return;

    let isMounted = true;
    setIsLoadingAvailability(true);

    fetchProviderAvailability(provider.id, selectedDate)
      .then((data) => {
        if (isMounted) {
          setSlotsAvailability(data.slots || []);
        }
      })
      .catch(() => {
        // Fallback: leave slots as default available if query fails
        if (isMounted) {
          setSlotsAvailability([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingAvailability(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, provider?.id, selectedDate]);

  if (!isOpen) return null;

  // Merge standard time slots with real-time backend availability
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

    const slot = effectiveSlots.find((s) => s.slotIndex === selectedSlotIndex) || effectiveSlots[0];
    if (!slot.isAvailable) {
      setErrorMessage('The selected time slot is already booked or unavailable. Please choose an open slot.');
      return;
    }

    const [year, month, day] = selectedDate.split('-').map(Number);

    // Wall-clock time: construct local browser Date so appointment matches customer's selected time.
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

      // Save customer address to address book if requested
      if (saveToAddressBook && (selectedAddressId === 'new' || savedAddresses.length === 0)) {
        saveAddress(user?.id, {
          label: newAddressLabel,
          street: street.trim(),
          city: city.trim(),
          postalCode: postalCode.trim() || undefined,
          isDefault: savedAddresses.length === 0,
        });
      }

      // Preserve legacy single address key for backward compatibility
      try {
        localStorage.setItem(
          STORAGE_KEY_ADDRESS,
          JSON.stringify({ street: street.trim(), city: city.trim(), postalCode: postalCode.trim() })
        );
      } catch {
        // ignore storage errors
      }

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

  const handleDoneAndViewBookings = () => {
    if (onNavigateToBookings) {
      onNavigateToBookings();
    } else if (typeof window !== 'undefined') {
      window.location.hash = '#/bookings';
    }
    onClose();
  };

  const selectedSlot = effectiveSlots.find((s) => s.slotIndex === selectedSlotIndex) || effectiveSlots[0];

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
                  {new Date(confirmedBooking.scheduledStartTime).toLocaleDateString()} • {selectedSlot.label}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-dwellio-teal/60">Service Address:</span>
                <span className="font-medium text-dwellio-teal">{street}, {city}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDoneAndViewBookings}
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
              {provider.verificationStatus === 'approved' ? (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Admin Verified
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  Pending Verification
                </span>
              )}
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
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="booking-date" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider">
                  Appointment Date *
                </label>
                {isLoadingAvailability && (
                  <span className="text-[10px] text-dwellio-teal/60 animate-pulse font-medium">
                    Checking availability...
                  </span>
                )}
              </div>
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

            {/* Service Location / Address Book Selector */}
            <div className="mb-4">
              {savedAddresses.length > 0 && (
                <div className="mb-2">
                  <span className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1.5">
                    Select Saved Address
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {savedAddresses.map((addr) => {
                      const isSel = selectedAddressId === addr.id;
                      return (
                        <button
                          key={addr.id}
                          type="button"
                          onClick={() => {
                            setSelectedAddressId(addr.id);
                            setStreet(addr.street);
                            setCity(addr.city);
                            setPostalCode(addr.postalCode || '');
                            setSaveToAddressBook(false);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition text-left flex items-center gap-1.5 ${
                            isSel
                              ? 'bg-dwellio-teal text-white border-dwellio-teal shadow-xs'
                              : 'bg-dwellio-ivory text-dwellio-teal border-dwellio-mint/60 hover:bg-white'
                          }`}
                        >
                          <span>{addr.label === 'Home' ? '🏠' : addr.label === 'Office' ? '🏢' : '📍'}</span>
                          <span>{addr.label}</span>
                          {addr.isDefault && (
                            <span className={`text-[10px] px-1 rounded ${isSel ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                              Default
                            </span>
                          )}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAddressId('new');
                        setStreet('');
                        setCity('');
                        setPostalCode('');
                        setSaveToAddressBook(true);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1 ${
                        selectedAddressId === 'new'
                          ? 'bg-dwellio-teal text-white border-dwellio-teal shadow-xs'
                          : 'bg-white text-dwellio-teal/80 border-dashed border-dwellio-mint hover:bg-dwellio-ivory'
                      }`}
                    >
                      <span>＋</span>
                      <span>Other Address</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Address Form Inputs */}
              <div className="grid grid-cols-2 gap-3">
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
                    placeholder="Door/Flat No., Street Name, Locality"
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
                    placeholder="PIN / Postal Code"
                    className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3.5 py-2 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                  />
                </div>
              </div>

              {/* Save to address book option if entering a new / custom address */}
              {(selectedAddressId === 'new' || savedAddresses.length === 0) && (
                <div className="mt-2.5 p-2.5 rounded-xl bg-dwellio-ivory/50 border border-dwellio-mint/40 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      id="save-to-address-book"
                      type="checkbox"
                      checked={saveToAddressBook}
                      onChange={(e) => setSaveToAddressBook(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-dwellio-teal border-dwellio-mint focus:ring-dwellio-teal"
                    />
                    <label htmlFor="save-to-address-book" className="text-xs text-dwellio-teal font-medium cursor-pointer">
                      Save to my address book for future bookings
                    </label>
                  </div>

                  {saveToAddressBook && (
                    <div className="flex items-center gap-1.5 pl-5">
                      <span className="text-[11px] text-dwellio-teal/60 font-medium">Label:</span>
                      {['Home', 'Office', 'Apartment', 'Other'].map((lbl) => (
                        <button
                          key={lbl}
                          type="button"
                          onClick={() => setNewAddressLabel(lbl)}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition ${
                            newAddressLabel === lbl
                              ? 'bg-dwellio-teal text-white border-dwellio-teal'
                              : 'bg-white text-dwellio-teal/70 border-dwellio-mint/60 hover:bg-dwellio-ivory'
                          }`}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Customer Notes */}
            <div className="mb-4">
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

            {/* Promo Code & Discount (Milestone 4D) */}
            <div className="mb-4 p-3.5 rounded-2xl bg-slate-50 border border-dwellio-mint/60">
              <label htmlFor="coupon-input" className="block text-[11px] font-bold text-dwellio-teal uppercase tracking-wider mb-1.5">
                Have a Promo Code?
              </label>
              {appliedCoupon ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 font-bold text-sm">🎉</span>
                    <div>
                      <span className="font-mono font-bold text-emerald-900 text-xs">{appliedCoupon.code}</span>
                      <p className="text-[10px] text-emerald-700">
                        {appliedCoupon.message || `Saved ₹${appliedCoupon.discountAmountRupees}!`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="text-xs font-bold text-emerald-800 hover:text-emerald-950 underline px-2 py-1"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <input
                      id="coupon-input"
                      type="text"
                      value={couponCodeInput}
                      onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                      placeholder="Enter coupon (e.g. WELCOME100)"
                      className="flex-1 rounded-xl border border-dwellio-mint/80 bg-white px-3.5 py-2 text-xs font-mono text-dwellio-teal uppercase focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={isValidatingCoupon || !couponCodeInput.trim()}
                      className="px-4 py-2 rounded-xl bg-dwellio-teal text-white text-xs font-bold hover:bg-dwellio-teal/90 transition disabled:opacity-50"
                    >
                      {isValidatingCoupon ? 'Checking...' : 'Apply'}
                    </button>
                  </div>
                  {couponError && (
                    <p className="text-[11px] text-rose-600 font-medium mt-1">{couponError}</p>
                  )}
                </div>
              )}
            </div>

            {/* Transparent Pricing Notice */}
            <div className="mb-4 p-3 rounded-2xl bg-dwellio-ivory/70 border border-dwellio-mint/50 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-dwellio-teal/80">
              <div className="flex items-center gap-2">
                <span className="text-sm">🏷️</span>
                <span>
                  <strong>Transparent Pricing:</strong> Indicative diagnostic visit from <strong>₹499</strong>. Final quotation provided after inspection.
                </span>
              </div>
              <span className="text-[11px] text-dwellio-teal/60 font-medium whitespace-nowrap">Pay On-Site</span>
            </div>

            {/* Discount Summary (if applied) */}
            {appliedCoupon && (
              <div className="mb-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                <div className="flex items-center justify-between font-medium">
                  <span>Standard Diagnostic Charge:</span>
                  <span>₹{baseServicePrice}</span>
                </div>
                <div className="flex items-center justify-between font-medium text-emerald-700">
                  <span>Coupon Savings ({appliedCoupon.code}):</span>
                  <span>-₹{appliedCoupon.discountAmountRupees}</span>
                </div>
                <div className="flex items-center justify-between font-bold pt-1 border-t border-emerald-300 text-sm">
                  <span>Net Estimated Payable:</span>
                  <span>₹{appliedCoupon.finalPayableRupees}</span>
                </div>
              </div>
            )}

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

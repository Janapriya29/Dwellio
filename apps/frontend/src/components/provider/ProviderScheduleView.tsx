import React, { useState, useEffect, useCallback } from 'react';
import { ProviderWorkingDay, ProviderBlockedDate } from '@dwellio/shared';
import { STANDARD_TIME_SLOTS } from '../booking/BookingModal';
import { useAuth } from '../../context/AuthContext';
import {
  fetchProviderSchedule,
  updateProviderSchedule,
  updateProviderAvailabilityStatus,
} from '../../services/providerService';

const DAYS_OF_WEEK = [
  { index: 1, label: 'Monday' },
  { index: 2, label: 'Tuesday' },
  { index: 3, label: 'Wednesday' },
  { index: 4, label: 'Thursday' },
  { index: 5, label: 'Friday' },
  { index: 6, label: 'Saturday' },
  { index: 0, label: 'Sunday' },
];

export const ProviderScheduleView: React.FC = () => {
  const { token } = useAuth();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Schedule state
  const [isAcceptingJobs, setIsAcceptingJobs] = useState<boolean>(true);
  const [scheduleMap, setScheduleMap] = useState<Record<number, number[]>>({});
  const [blockedDates, setBlockedDates] = useState<ProviderBlockedDate[]>([]);

  // New blocked date inputs
  const [newDate, setNewDate] = useState<string>('');
  const [newReason, setNewReason] = useState<string>('');

  const loadSchedule = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchProviderSchedule(token);
      setIsAcceptingJobs(data.isAcceptingJobs);
      setBlockedDates(data.blockedDates || []);

      const map: Record<number, number[]> = {};
      DAYS_OF_WEEK.forEach((d) => {
        map[d.index] = [];
      });

      if (data.workingSchedule && data.workingSchedule.length > 0) {
        data.workingSchedule.forEach((item) => {
          map[item.dayOfWeek] = [...item.activeSlotIndices];
        });
      } else {
        // Default: Mon-Sat all 4 slots, Sun off
        [1, 2, 3, 4, 5, 6].forEach((d) => {
          map[d] = [0, 1, 2, 3];
        });
        map[0] = [];
      }

      setScheduleMap(map);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load working schedule.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const handleToggleAcceptingJobs = async () => {
    if (!token || isTogglingStatus) return;
    const nextVal = !isAcceptingJobs;
    setIsTogglingStatus(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await updateProviderAvailabilityStatus(nextVal, token);
      setIsAcceptingJobs(res.isAcceptingJobs);
      setSuccessMessage(
        res.isAcceptingJobs
          ? 'You are now online and accepting new booking requests!'
          : 'Job intake paused. You will not receive new booking requests.'
      );
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update job intake status.');
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleToggleSlot = (dayOfWeek: number, slotIndex: number) => {
    setScheduleMap((prev) => {
      const currentSlots = prev[dayOfWeek] || [];
      const updated = currentSlots.includes(slotIndex)
        ? currentSlots.filter((s) => s !== slotIndex)
        : [...currentSlots, slotIndex].sort((a, b) => a - b);
      return { ...prev, [dayOfWeek]: updated };
    });
  };

  const handleSetDayAll = (dayOfWeek: number, active: boolean) => {
    setScheduleMap((prev) => ({
      ...prev,
      [dayOfWeek]: active ? [0, 1, 2, 3] : [],
    }));
  };

  const handleAddBlockedDate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate) return;

    if (blockedDates.some((b) => b.date === newDate)) {
      setErrorMessage(`Date ${newDate} is already in your blocked dates.`);
      return;
    }

    setBlockedDates((prev) => [
      ...prev,
      { date: newDate, reason: newReason.trim() || undefined },
    ].sort((a, b) => a.date.localeCompare(b.date)));

    setNewDate('');
    setNewReason('');
    setErrorMessage(null);
  };

  const handleRemoveBlockedDate = (dateToRemove: string) => {
    setBlockedDates((prev) => prev.filter((b) => b.date !== dateToRemove));
  };

  const handleSaveSchedule = async () => {
    if (!token) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const workingSchedule: ProviderWorkingDay[] = Object.entries(scheduleMap).map(
      ([day, slots]) => ({
        dayOfWeek: parseInt(day, 10),
        activeSlotIndices: slots,
      })
    );

    try {
      await updateProviderSchedule(
        {
          workingSchedule,
          blockedDates,
        },
        token
      );
      setSuccessMessage('Working schedule and time-off saved successfully!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save working schedule.');
    } finally {
      setIsSaving(false);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* Header and Intake Status Toggle */}
      <div className="bg-white rounded-3xl p-6 border border-dwellio-mint/50 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-dwellio-teal flex items-center gap-2">
            <span>📅</span> Working Schedule &amp; Dynamic Availability
          </h2>
          <p className="text-xs text-dwellio-teal/70 mt-1">
            Configure your regular working hours, active time windows, and scheduled holidays
          </p>
        </div>

        {/* Accepting Jobs Toggle Control */}
        <div className="flex items-center gap-3 bg-dwellio-ivory p-3 rounded-2xl border border-dwellio-mint/40">
          <div className="text-right">
            <span className="block text-xs font-bold text-dwellio-teal">
              {isAcceptingJobs ? 'Accepting New Jobs' : 'Job Intake Paused'}
            </span>
            <span className="block text-[10px] text-dwellio-teal/60">
              {isAcceptingJobs ? 'Visible in customer discovery' : 'Hidden from booking availability'}
            </span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isAcceptingJobs}
            disabled={isTogglingStatus}
            onClick={handleToggleAcceptingJobs}
            data-testid="toggle-accepting-jobs"
            className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isAcceptingJobs ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                isAcceptingJobs ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Notification Banners */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
          ⚠️ {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          ✓ {successMessage}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-48 bg-white/70 rounded-3xl border border-dwellio-mint/40" />
          <div className="h-32 bg-white/70 rounded-3xl border border-dwellio-mint/40" />
        </div>
      ) : (
        <>
          {/* Weekly Schedule Matrix */}
          <div className="bg-white rounded-3xl p-6 border border-dwellio-mint/50 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-dwellio-mint/30 pb-3">
              <div>
                <h3 className="text-base font-bold text-dwellio-teal">
                  Weekly Operating Hours
                </h3>
                <p className="text-xs text-dwellio-teal/60">
                  Select which 2-hour standard appointment slots you accept for each day of the week
                </p>
              </div>

              <button
                type="button"
                onClick={handleSaveSchedule}
                disabled={isSaving}
                className="px-5 py-2 rounded-xl bg-[#D9653B] text-white text-xs font-bold hover:bg-[#c4562f] shadow transition disabled:opacity-50 flex items-center justify-center gap-1.5 self-start sm:self-auto"
              >
                {isSaving ? 'Saving Schedule...' : 'Save Weekly Schedule'}
              </button>
            </div>

            <div className="space-y-3">
              {DAYS_OF_WEEK.map((day) => {
                const activeSlots = scheduleMap[day.index] || [];
                const isDayOff = activeSlots.length === 0;

                return (
                  <div
                    key={day.index}
                    className={`p-4 rounded-2xl border transition ${
                      isDayOff
                        ? 'bg-slate-50 border-slate-200 text-slate-500'
                        : 'bg-dwellio-ivory/40 border-dwellio-mint/50 text-dwellio-teal'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold text-sm text-dwellio-teal">
                          {day.label}
                        </span>
                        {isDayOff ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-200 text-slate-700">
                            Day Off
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                            {activeSlots.length} of {STANDARD_TIME_SLOTS.length} slots active
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSetDayAll(day.index, true)}
                          className="px-2.5 py-1 rounded-lg border border-dwellio-mint text-[11px] font-semibold hover:bg-white transition"
                        >
                          All Slots
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetDayAll(day.index, false)}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 text-[11px] font-semibold text-slate-600 hover:bg-white transition"
                        >
                          Mark Off
                        </button>
                      </div>
                    </div>

                    {/* Slots Grid for this Day */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                      {STANDARD_TIME_SLOTS.map((slot) => {
                        const isSlotActive = activeSlots.includes(slot.slotIndex);
                        return (
                          <label
                            key={slot.slotIndex}
                            className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                              isSlotActive
                                ? 'bg-white border-dwellio-teal/40 font-bold shadow-xs text-dwellio-teal'
                                : 'bg-white/40 border-slate-200 text-slate-400 font-medium'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSlotActive}
                              onChange={() => handleToggleSlot(day.index, slot.slotIndex)}
                              className="rounded border-dwellio-mint text-dwellio-teal focus:ring-dwellio-teal"
                            />
                            <span>{slot.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Blocked Dates / Vacation & Time-Off Management */}
          <div className="bg-white rounded-3xl p-6 border border-dwellio-mint/50 shadow-xs space-y-5">
            <div>
              <h3 className="text-base font-bold text-dwellio-teal">
                Holidays, Vacations &amp; Blocked Dates
              </h3>
              <p className="text-xs text-dwellio-teal/60">
                Block specific calendar dates when you will be unavailable for service appointments
              </p>
            </div>

            {/* Add Blocked Date Form */}
            <form onSubmit={handleAddBlockedDate} className="flex flex-col sm:flex-row items-end gap-3 p-4 bg-dwellio-ivory/50 rounded-2xl border border-dwellio-mint/40">
              <div className="w-full sm:w-auto">
                <label htmlFor="block-date-input" className="block text-xs font-bold text-dwellio-teal mb-1">
                  Select Date
                </label>
                <input
                  id="block-date-input"
                  type="date"
                  min={todayStr}
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  required
                  className="px-3.5 py-2 rounded-xl border border-dwellio-mint text-xs text-dwellio-teal bg-white focus:outline-none focus:ring-2 focus:ring-dwellio-teal w-full"
                />
              </div>

              <div className="flex-1 w-full">
                <label htmlFor="block-reason-input" className="block text-xs font-bold text-dwellio-teal mb-1">
                  Reason (Optional)
                </label>
                <input
                  id="block-reason-input"
                  type="text"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder="e.g. Festival holiday, equipment service, annual leave..."
                  className="px-3.5 py-2 rounded-xl border border-dwellio-mint text-xs text-dwellio-teal bg-white focus:outline-none focus:ring-2 focus:ring-dwellio-teal w-full"
                />
              </div>

              <button
                type="submit"
                disabled={!newDate}
                className="w-full sm:w-auto px-5 py-2 rounded-xl bg-dwellio-teal text-white text-xs font-bold hover:opacity-90 transition disabled:opacity-50"
              >
                + Block Date
              </button>
            </form>

            {/* Currently Blocked Dates List */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-dwellio-teal/70 mb-2">
                Currently Blocked Dates ({blockedDates.length})
              </h4>

              {blockedDates.length === 0 ? (
                <p className="text-xs text-dwellio-teal/60 italic py-2">
                  No blocked dates configured. You are operating normally on all enabled weekly schedule days.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {blockedDates.map((item) => (
                    <div
                      key={item.date}
                      className="flex items-center justify-between p-3 rounded-xl bg-dwellio-ivory border border-dwellio-mint/60 text-xs"
                    >
                      <div>
                        <span className="font-bold text-dwellio-teal block">
                          📅 {item.date}
                        </span>
                        <span className="text-[11px] text-dwellio-teal/70 block">
                          {item.reason || 'Unavailable / Personal Leave'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveBlockedDate(item.date)}
                        className="w-6 h-6 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold flex items-center justify-center transition cursor-pointer"
                        title="Unblock date"
                        aria-label={`Unblock date ${item.date}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Save All Changes Button */}
            <div className="flex justify-end pt-3 border-t border-dwellio-mint/30">
              <button
                type="button"
                onClick={handleSaveSchedule}
                disabled={isSaving}
                className="px-6 py-2.5 rounded-xl bg-[#D9653B] text-white text-xs font-bold hover:bg-[#c4562f] shadow transition disabled:opacity-50"
              >
                {isSaving ? 'Saving Changes...' : 'Save Schedule & Blocked Dates'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

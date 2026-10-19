import React, { useState, useEffect, useCallback } from 'react';
import { BookingStatus, PaginationMeta, AdminBookingItem, BookingData } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import { fetchAdminBookings, fetchAdminBookingById } from '../../services/adminService';

const STATUS_FILTERS: { label: string; value?: BookingStatus }[] = [
  { label: 'All Statuses' },
  { label: 'Requested', value: 'requested' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'On The Way', value: 'on_the_way' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Rejected', value: 'rejected' },
];

const getStatusBadge = (status: BookingStatus) => {
  switch (status) {
    case 'requested':
      return 'bg-amber-50 text-amber-900 border-amber-300';
    case 'accepted':
      return 'bg-sky-50 text-sky-900 border-sky-300';
    case 'on_the_way':
      return 'bg-purple-50 text-purple-900 border-purple-300';
    case 'in_progress':
      return 'bg-indigo-50 text-indigo-900 border-indigo-300';
    case 'completed':
      return 'bg-emerald-50 text-emerald-900 border-emerald-300';
    case 'cancelled':
      return 'bg-slate-100 text-slate-700 border-slate-300';
    case 'rejected':
      return 'bg-rose-50 text-rose-900 border-rose-300';
    default:
      return 'bg-slate-50 text-slate-800 border-slate-300';
  }
};

export const AdminBookingsView: React.FC = () => {
  const { token } = useAuth();
  const [bookings, setBookings] = useState<AdminBookingItem[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<BookingStatus | undefined>(undefined);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inspection modal
  const [inspectingBookingId, setInspectingBookingId] = useState<string | null>(null);
  const [inspectingData, setInspectingData] = useState<BookingData | null>(null);
  const [isDetailsLoading, setIsDetailsLoading] = useState<boolean>(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const loadBookings = useCallback(
    async (pageToLoad = pagination.page) => {
      if (!token) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetchAdminBookings(token, {
          page: pageToLoad,
          limit: 10,
          status: selectedStatus,
        });
        setBookings(res.items);
        setPagination(res.pagination);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load bookings.');
      } finally {
        setIsLoading(false);
      }
    },
    [token, selectedStatus, pagination.page]
  );

  useEffect(() => {
    loadBookings(1);
  }, [selectedStatus]);

  const handleInspect = async (bookingId: string) => {
    if (!token) return;
    setInspectingBookingId(bookingId);
    setIsDetailsLoading(true);
    setDetailsError(null);
    try {
      const data = await fetchAdminBookingById(token, bookingId);
      setInspectingData(data);
    } catch (err: any) {
      setDetailsError(err.message || 'Failed to load booking details.');
    } finally {
      setIsDetailsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-dwellio-teal">Platform Booking Oversight</h2>
          <p className="text-xs text-dwellio-teal/70">
            Read-only oversight across all platform bookings, schedules, and lifecycle status audits.
          </p>
        </div>

        {/* Status Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-dwellio-teal">Status:</span>
          <select
            value={selectedStatus || ''}
            onChange={(e) => setSelectedStatus((e.target.value as BookingStatus) || undefined)}
            className="text-xs p-2 bg-white border border-dwellio-mint/60 rounded-xl focus:outline-hidden"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.label} value={f.value || ''}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
          {errorMessage}
        </div>
      )}

      {/* Table / List */}
      {isLoading ? (
        <div className="py-16 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-dwellio-teal border-t-transparent mb-3" />
          <p className="text-sm font-semibold text-dwellio-teal/70">Loading platform bookings...</p>
        </div>
      ) : bookings.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-dwellio-mint/40">
          <p className="text-sm font-bold text-dwellio-teal">No bookings found</p>
          <p className="text-xs text-dwellio-teal/60 mt-1">
            No bookings match the current filter selection.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dwellio-mint/40 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-dwellio-teal">
              <thead className="bg-dwellio-ivory/50 border-b border-dwellio-mint/30 font-bold">
                <tr>
                  <th className="py-3 px-4">Booking ID</th>
                  <th className="py-3 px-4">Service</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Provider</th>
                  <th className="py-3 px-4">Scheduled Window</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dwellio-mint/20">
                {bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-dwellio-ivory/20 transition">
                    <td className="py-3 px-4 font-mono text-[11px] text-dwellio-teal/70">
                      #{b.id.slice(-6)}
                    </td>
                    <td className="py-3 px-4 font-bold text-dwellio-teal">{b.serviceName}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold">{b.customerName}</div>
                      {b.customerEmail && (
                        <div className="text-[11px] text-dwellio-teal/60">{b.customerEmail}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold">{b.providerDisplayName}</div>
                      {b.providerPhone && (
                        <div className="text-[11px] text-dwellio-teal/60">{b.providerPhone}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        {new Date(b.scheduledStartTime).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                      <div className="text-[11px] text-dwellio-teal/60">
                        {new Date(b.scheduledStartTime).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        -{' '}
                        {new Date(b.scheduledEndTime).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border capitalize ${getStatusBadge(
                          b.status
                        )}`}
                      >
                        {b.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleInspect(b.id)}
                        className="px-2.5 py-1 bg-white border border-dwellio-mint/60 hover:bg-dwellio-ivory text-dwellio-teal font-bold rounded-lg transition"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="p-3 border-t border-dwellio-mint/30 flex items-center justify-between text-xs text-dwellio-teal/70 bg-dwellio-ivory/20">
              <span>
                Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => loadBookings(pagination.page - 1)}
                  className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => loadBookings(pagination.page + 1)}
                  className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inspection Modal */}
      {inspectingBookingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-dwellio-mint/40 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-dwellio-mint/30 pb-3">
              <div>
                <h3 className="text-base font-bold text-dwellio-teal">
                  Booking Inspection: #{inspectingBookingId.slice(-6)}
                </h3>
                <p className="text-[11px] text-dwellio-teal/60">
                  Read-only platform oversight and status transition audit history
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInspectingBookingId(null);
                  setInspectingData(null);
                }}
                className="w-7 h-7 rounded-lg bg-dwellio-ivory text-dwellio-teal font-bold hover:bg-dwellio-mint/40 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {isDetailsLoading ? (
              <div className="py-12 text-center">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-3 border-dwellio-teal border-t-transparent mb-2" />
                <p className="text-xs font-semibold text-dwellio-teal/70">Fetching booking audit record...</p>
              </div>
            ) : detailsError ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                {detailsError}
              </div>
            ) : inspectingData ? (
              <div className="space-y-4 text-xs">
                {/* Notice banner */}
                <div className="p-3 bg-dwellio-ivory border border-dwellio-mint/60 rounded-xl text-[11px] text-dwellio-teal/80 flex items-center gap-2">
                  <span>🔒</span>
                  <span>
                    <strong>Platform Oversight Mode:</strong> Booking lifecycle states are managed
                    exclusively by the customer and provider according to the booking state machine.
                  </span>
                </div>

                {/* Grid details */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-dwellio-ivory/30 rounded-xl border border-dwellio-mint/30">
                  <div>
                    <span className="text-[11px] font-semibold text-dwellio-teal/60">Service</span>
                    <p className="font-bold text-dwellio-teal">{inspectingData.service?.name}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-dwellio-teal/60">Current Status</span>
                    <p>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${getStatusBadge(
                          inspectingData.status
                        )}`}
                      >
                        {inspectingData.status.replace(/_/g, ' ')}
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-dwellio-teal/60">Customer</span>
                    <p className="font-bold text-dwellio-teal">{inspectingData.customer?.name}</p>
                    <p className="text-[11px] text-dwellio-teal/60">{inspectingData.customer?.email}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-dwellio-teal/60">Provider</span>
                    <p className="font-bold text-dwellio-teal">{inspectingData.provider?.displayName}</p>
                    <p className="text-[11px] text-dwellio-teal/60">{inspectingData.provider?.phone}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[11px] font-semibold text-dwellio-teal/60">Scheduled Window</span>
                    <p className="font-bold text-dwellio-teal">
                      {new Date(inspectingData.scheduledStartTime).toLocaleString()} &mdash;{' '}
                      {new Date(inspectingData.scheduledEndTime).toLocaleTimeString()}
                    </p>
                  </div>
                  {inspectingData.address && (
                    <div className="col-span-2">
                      <span className="text-[11px] font-semibold text-dwellio-teal/60">Service Address</span>
                      <p className="text-dwellio-teal">
                        {typeof inspectingData.address === 'string'
                          ? inspectingData.address
                          : `${inspectingData.address.street}, ${inspectingData.address.city}${
                              inspectingData.address.postalCode ? ' - ' + inspectingData.address.postalCode : ''
                            }`}
                      </p>
                    </div>
                  )}
                  {inspectingData.customerNotes && (
                    <div className="col-span-2">
                      <span className="text-[11px] font-semibold text-dwellio-teal/60">Customer Notes</span>
                      <p className="text-dwellio-teal italic">{inspectingData.customerNotes}</p>
                    </div>
                  )}
                  {inspectingData.cancellationReason && (
                    <div className="col-span-2 p-2 bg-rose-50 rounded-lg border border-rose-200">
                      <span className="text-[11px] font-bold text-rose-800">Cancellation Reason</span>
                      <p className="text-rose-900">{inspectingData.cancellationReason}</p>
                    </div>
                  )}
                  {inspectingData.rejectionReason && (
                    <div className="col-span-2 p-2 bg-rose-50 rounded-lg border border-rose-200">
                      <span className="text-[11px] font-bold text-rose-800">Rejection Reason</span>
                      <p className="text-rose-900">{inspectingData.rejectionReason}</p>
                    </div>
                  )}
                </div>

                {/* Status History Timeline */}
                <div>
                  <h4 className="font-bold text-dwellio-teal text-xs mb-2">Status Transition Audit Trail</h4>
                  {inspectingData.statusHistory && inspectingData.statusHistory.length > 0 ? (
                    <div className="space-y-2 border-l-2 border-dwellio-mint/60 ml-2 pl-3">
                      {inspectingData.statusHistory.map((sh, idx) => {
                        const statusText = sh.toStatus || (sh as any).status || 'status';
                        const timeText = sh.timestamp || (sh as any).changedAt;
                        const reasonText = sh.reason || (sh as any).note;
                        return (
                          <div key={idx} className="relative">
                            <div className="w-2 h-2 rounded-full bg-dwellio-teal absolute -left-[17px] top-1" />
                            <div className="flex items-center gap-2">
                              <span className="font-bold capitalize text-dwellio-teal">
                                {statusText.replace(/_/g, ' ')}
                              </span>
                              {timeText && (
                                <span className="text-[10px] text-dwellio-teal/50">
                                  {new Date(timeText).toLocaleString()}
                                </span>
                              )}
                            </div>
                            {reasonText && (
                              <p className="text-[11px] text-dwellio-teal/70 italic mt-0.5">{reasonText}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-dwellio-teal/60 italic">No transition history recorded.</p>
                  )}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-2 border-t border-dwellio-mint/30">
              <button
                type="button"
                onClick={() => {
                  setInspectingBookingId(null);
                  setInspectingData(null);
                }}
                className="px-4 py-2 bg-dwellio-teal text-white rounded-xl text-xs font-bold transition hover:opacity-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { AdminProviderDetail, PaginationMeta, ProviderVerificationStatus } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import {
  fetchAdminProviders,
  fetchAdminProviderDetail,
  updateAdminProviderStatus,
} from '../../services/adminService';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const AdminVerifiedProvidersView: React.FC = () => {
  const { token } = useAuth();
  const [providers, setProviders] = useState<AdminProviderDetail[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'suspended'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Selected provider for detail modal
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [providerDetail, setProviderDetail] = useState<AdminProviderDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);

  // Status Change Modal State
  const [targetProvider, setTargetProvider] = useState<AdminProviderDetail | null>(null);
  const [targetStatus, setTargetStatus] = useState<'approved' | 'suspended'>('suspended');
  const [statusReason, setStatusReason] = useState<string>('');
  const [isSubmittingStatus, setIsSubmittingStatus] = useState<boolean>(false);
  const [statusModalError, setStatusModalError] = useState<string | null>(null);

  const loadProviders = useCallback(
    async (pageToLoad = 1) => {
      if (!token) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetchAdminProviders(token, {
          page: pageToLoad,
          limit: 10,
          q: searchQuery.trim() || undefined,
          status: statusFilter === 'all' ? undefined : (statusFilter as ProviderVerificationStatus),
        });
        setProviders(res.items);
        setPagination(res.pagination);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load verified providers.');
      } finally {
        setIsLoading(false);
      }
    },
    [token, searchQuery, statusFilter]
  );

  useEffect(() => {
    loadProviders(1);
  }, [loadProviders]);

  const handleOpenDetail = async (providerId: string) => {
    if (!token) return;
    setSelectedProviderId(providerId);
    setIsLoadingDetail(true);
    try {
      const detail = await fetchAdminProviderDetail(token, providerId);
      setProviderDetail(detail);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load provider profile details.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedProviderId(null);
    setProviderDetail(null);
  };

  const handleOpenStatusModal = (
    provider: AdminProviderDetail,
    newStatus: 'approved' | 'suspended'
  ) => {
    setTargetProvider(provider);
    setTargetStatus(newStatus);
    setStatusReason('');
    setStatusModalError(null);
  };

  const handleCloseStatusModal = () => {
    setTargetProvider(null);
    setStatusReason('');
    setStatusModalError(null);
  };

  const handleSubmitStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !targetProvider) return;

    if (targetStatus === 'suspended' && statusReason.trim().length < 5) {
      setStatusModalError('A suspension reason of at least 5 characters is required.');
      return;
    }

    setIsSubmittingStatus(true);
    setStatusModalError(null);

    try {
      const updated = await updateAdminProviderStatus(token, targetProvider.id, {
        status: targetStatus,
        reason: statusReason.trim() || undefined,
      });

      setActionSuccessMessage(
        `Provider ${updated.displayName} has been successfully ${
          targetStatus === 'approved' ? 'reactivated' : 'suspended'
        }.`
      );

      handleCloseStatusModal();
      if (selectedProviderId === targetProvider.id) {
        setProviderDetail(updated);
      }
      loadProviders(pagination.page);

      setTimeout(() => setActionSuccessMessage(null), 5000);
    } catch (err: any) {
      setStatusModalError(err.message || `Failed to ${targetStatus} provider.`);
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-dwellio-teal flex items-center gap-2">
            <span>👷</span> Verified Provider Governance
          </h2>
          <p className="text-xs text-dwellio-teal/70">
            Monitor active professionals, inspect working schedules, and govern service provider standing.
          </p>
        </div>
        <div className="text-xs font-semibold text-dwellio-teal/60">
          Total providers: <strong className="text-dwellio-teal">{pagination.total}</strong>
        </div>
      </div>

      {actionSuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl shadow-xs">
          ✓ {actionSuccessMessage}
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl shadow-xs">
          ✕ {errorMessage}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 rounded-2xl border border-dwellio-mint/40 shadow-xs">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search provider by name, phone, or skills..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-dwellio-mint/40 rounded-xl focus:outline-hidden focus:border-dwellio-teal"
          />
          <span className="absolute left-3 top-2.5 text-xs text-dwellio-teal/40">🔍</span>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
          {(['all', 'approved', 'suspended'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl capitalize transition ${
                statusFilter === status
                  ? 'bg-dwellio-teal text-white shadow-xs'
                  : 'bg-dwellio-ivory text-dwellio-teal/70 hover:bg-dwellio-mint/30'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Providers Table */}
      <div className="bg-white rounded-2xl border border-dwellio-mint/40 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-dwellio-teal border-t-transparent mb-3" />
            <p className="text-xs text-dwellio-teal/70">Loading verified providers...</p>
          </div>
        ) : providers.length === 0 ? (
          <div className="py-12 text-center text-xs text-dwellio-teal/60 italic">
            No service providers found matching the search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-dwellio-teal border-collapse">
              <thead>
                <tr className="bg-dwellio-ivory/80 border-b border-dwellio-mint/30 font-bold">
                  <th className="py-3 px-4">Provider</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Rating</th>
                  <th className="py-3 px-4 text-center">Completed</th>
                  <th className="py-3 px-4 text-right">Lifetime Earnings</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dwellio-mint/20">
                {providers.map((p) => (
                  <tr key={p.id} className="hover:bg-dwellio-ivory/30 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold">{p.displayName}</div>
                      <div className="text-[11px] text-dwellio-teal/60 truncate max-w-xs">
                        {p.skills.join(', ') || 'No skills listed'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-dwellio-teal/70">
                      <div>{p.phone}</div>
                      {p.user?.email && <div className="text-[11px] text-dwellio-teal/50">{p.user.email}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.verificationStatus === 'approved'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : p.verificationStatus === 'suspended'
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {p.verificationStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-amber-600">
                      ⭐ {p.ratingAverage ? p.ratingAverage.toFixed(1) : 'New'} ({p.reviewCount || 0})
                    </td>
                    <td className="py-3 px-4 text-center font-bold">{p.completedJobsCount || 0}</td>
                    <td className="py-3 px-4 text-right font-black text-dwellio-teal">
                      ₹{(p.lifetimeEarnings || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(p.id)}
                        className="px-2.5 py-1 text-xs font-semibold text-dwellio-teal hover:bg-dwellio-mint/30 rounded-lg transition"
                      >
                        Profile
                      </button>

                      {p.verificationStatus === 'approved' && (
                        <button
                          type="button"
                          onClick={() => handleOpenStatusModal(p, 'suspended')}
                          className="px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition"
                        >
                          Suspend
                        </button>
                      )}

                      {p.verificationStatus === 'suspended' && (
                        <button
                          type="button"
                          onClick={() => handleOpenStatusModal(p, 'approved')}
                          className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                        >
                          Reactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="p-3 bg-dwellio-ivory/50 border-t border-dwellio-mint/30 flex items-center justify-between text-xs">
            <span className="text-dwellio-teal/70">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => loadProviders(pagination.page - 1)}
                className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
              >
                &larr; Prev
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadProviders(pagination.page + 1)}
                className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Provider Details Modal */}
      {selectedProviderId && (
        <div className="fixed inset-0 z-50 bg-dwellio-teal/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-dwellio-mint/50 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-dwellio-mint/20 pb-3">
              <div>
                <h3 className="text-base font-bold text-dwellio-teal">Provider Profile &amp; Availability</h3>
                <p className="text-xs text-dwellio-teal/60">Schedules, blocked dates, and earnings record</p>
              </div>
              <button
                type="button"
                onClick={handleCloseDetail}
                className="text-dwellio-teal/60 hover:text-dwellio-teal text-xl font-bold"
              >
                ✕
              </button>
            </div>

            {isLoadingDetail || !providerDetail ? (
              <div className="py-12 text-center text-xs text-dwellio-teal/60">
                Loading detailed provider profile...
              </div>
            ) : (
              <div className="space-y-4">
                {/* Snapshot Card */}
                <div className="p-4 bg-dwellio-ivory/50 rounded-2xl border border-dwellio-mint/40 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-dwellio-teal/60">Display Name</span>
                    <div className="font-bold text-dwellio-teal">{providerDetail.displayName}</div>
                  </div>
                  <div>
                    <span className="text-dwellio-teal/60">Phone Number</span>
                    <div className="font-bold text-dwellio-teal">{providerDetail.phone}</div>
                  </div>
                  <div>
                    <span className="text-dwellio-teal/60">Status</span>
                    <div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          providerDetail.verificationStatus === 'approved'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : providerDetail.verificationStatus === 'suspended'
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {providerDetail.verificationStatus}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-dwellio-teal/60">Service Area</span>
                    <div className="font-bold text-dwellio-teal">{providerDetail.serviceArea}</div>
                  </div>
                </div>

                {/* Suspension Banner */}
                {providerDetail.verificationStatus === 'suspended' && providerDetail.suspensionReason && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1">
                    <div className="font-bold text-rose-800">Account Suspension Notice:</div>
                    <div className="text-rose-700 italic">"{providerDetail.suspensionReason}"</div>
                    {providerDetail.suspendedAt && (
                      <div className="text-[10px] text-rose-600">
                        Suspended on: {new Date(providerDetail.suspendedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}

                {/* Performance Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-white border border-dwellio-mint/40 rounded-xl">
                    <span className="text-xs text-dwellio-teal/60">Lifetime Earnings</span>
                    <div className="text-xl font-black text-dwellio-teal mt-1">
                      ₹{(providerDetail.lifetimeEarnings || 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="p-3 bg-white border border-dwellio-mint/40 rounded-xl">
                    <span className="text-xs text-dwellio-teal/60">Completed Jobs</span>
                    <div className="text-xl font-black text-emerald-700 mt-1">
                      {providerDetail.completedJobsCount || 0}
                    </div>
                  </div>
                  <div className="p-3 bg-white border border-dwellio-mint/40 rounded-xl">
                    <span className="text-xs text-dwellio-teal/60">Rating</span>
                    <div className="text-xl font-black text-amber-600 mt-1">
                      ⭐ {providerDetail.ratingAverage ? providerDetail.ratingAverage.toFixed(1) : 'New'}
                    </div>
                  </div>
                  <div className="p-3 bg-white border border-dwellio-mint/40 rounded-xl">
                    <span className="text-xs text-dwellio-teal/60">Reviews</span>
                    <div className="text-xl font-black text-dwellio-teal mt-1">
                      {providerDetail.reviewCount || 0}
                    </div>
                  </div>
                </div>

                {/* Working Schedule */}
                <div>
                  <h4 className="text-xs font-bold text-dwellio-teal mb-2">Weekly Working Hours</h4>
                  {providerDetail.workingSchedule && providerDetail.workingSchedule.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {providerDetail.workingSchedule.map((s, idx) => {
                        const dayName = (s as any).day || DAY_NAMES[s.dayOfWeek] || `Day ${s.dayOfWeek}`;
                        const isWorking =
                          (s as any).isWorkingDay !== undefined
                            ? (s as any).isWorkingDay
                            : (s.activeSlotIndices && s.activeSlotIndices.length > 0);
                        const slotCount = s.activeSlotIndices?.length || 0;

                        return (
                          <div
                            key={idx}
                            className={`p-2 rounded-xl border ${
                              isWorking
                                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                                : 'bg-slate-50 border-slate-200 text-slate-500'
                            }`}
                          >
                            <div className="font-bold capitalize">{dayName}</div>
                            <div className="text-[11px] mt-0.5">
                              {isWorking ? `${slotCount} active booking slots` : 'Day Off'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-dwellio-teal/60 italic">Standard schedule (09:00 - 18:00 Mon-Sat)</p>
                  )}
                </div>

                {/* Blocked Dates */}
                <div>
                  <h4 className="text-xs font-bold text-dwellio-teal mb-2">Blocked Dates &amp; Time Off</h4>
                  {providerDetail.blockedDates && providerDetail.blockedDates.length > 0 ? (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {providerDetail.blockedDates.map((d, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium"
                        >
                          📅 {new Date(d.date).toLocaleDateString()}{' '}
                          {d.reason && <span className="text-rose-600">({d.reason})</span>}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-dwellio-teal/60 italic">No blocked dates scheduled.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Suspension / Reactivation Modal */}
      {targetProvider && (
        <div className="fixed inset-0 z-50 bg-dwellio-teal/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-dwellio-mint/50 p-6 max-w-md w-full shadow-xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-dwellio-teal">
                {targetStatus === 'suspended' ? 'Confirm Provider Suspension' : 'Confirm Provider Reactivation'}
              </h3>
              <p className="text-xs text-dwellio-teal/70 mt-1">
                {targetStatus === 'suspended'
                  ? `Suspending ${targetProvider.displayName} will immediately hide their profile from customer search, cancel upcoming acceptance, and disable their login.`
                  : `Reactivating ${targetProvider.displayName} will restore their approved standing and allow new customer bookings.`}
              </p>
            </div>

            {statusModalError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl">
                ✕ {statusModalError}
              </div>
            )}

            <form onSubmit={handleSubmitStatus} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-dwellio-teal mb-1">
                  Reason for {targetStatus === 'suspended' ? 'Suspension' : 'Reactivation'}{' '}
                  {targetStatus === 'suspended' && <span className="text-rose-600">*</span>}
                </label>
                <textarea
                  rows={3}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder={
                    targetStatus === 'suspended'
                      ? 'E.g., Repeated unexcused job no-shows or customer quality complaints...'
                      : 'E.g., Quality audit passed and provider onboarding verification complete...'
                  }
                  required={targetStatus === 'suspended'}
                  className="w-full p-2.5 text-xs border border-dwellio-mint/40 rounded-xl focus:outline-hidden focus:border-dwellio-teal"
                />
                <span className="text-[10px] text-dwellio-teal/60">
                  {targetStatus === 'suspended' ? 'Minimum 5 characters required for audit trail' : 'Optional reason'}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseStatusModal}
                  disabled={isSubmittingStatus}
                  className="px-4 py-2 border border-dwellio-mint/50 rounded-xl text-xs font-bold text-dwellio-teal hover:bg-dwellio-ivory transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStatus}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition ${
                    targetStatus === 'suspended'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isSubmittingStatus
                    ? 'Processing...'
                    : targetStatus === 'suspended'
                    ? 'Suspend Provider'
                    : 'Reactivate Provider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

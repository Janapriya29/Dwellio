import React, { useState, useEffect, useCallback } from 'react';
import { AdminCustomerItem, AdminCustomerDetail, PaginationMeta } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import {
  fetchAdminCustomers,
  fetchAdminCustomerById,
  updateAdminCustomerStatus,
} from '../../services/adminService';

export const AdminCustomersView: React.FC = () => {
  const { token, user: currentUser } = useAuth();
  const [customers, setCustomers] = useState<AdminCustomerItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Selected customer for detail modal
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<AdminCustomerDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);

  // Suspension / Reactivation modal state
  const [targetCustomer, setTargetCustomer] = useState<AdminCustomerItem | null>(null);
  const [actionType, setActionType] = useState<'suspend' | 'activate'>('suspend');
  const [statusReason, setStatusReason] = useState<string>('');
  const [isSubmittingStatus, setIsSubmittingStatus] = useState<boolean>(false);
  const [statusModalError, setStatusModalError] = useState<string | null>(null);

  const loadCustomers = useCallback(
    async (pageToLoad = 1) => {
      if (!token) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetchAdminCustomers(token, {
          page: pageToLoad,
          limit: 10,
          q: searchQuery.trim() || undefined,
          status: statusFilter === 'all' ? undefined : statusFilter,
        });
        setCustomers(res.items);
        setPagination(res.pagination);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load customers.');
      } finally {
        setIsLoading(false);
      }
    },
    [token, searchQuery, statusFilter]
  );

  useEffect(() => {
    loadCustomers(1);
  }, [loadCustomers]);

  const handleOpenDetail = async (customerId: string) => {
    if (!token) return;
    setSelectedCustomerId(customerId);
    setIsLoadingDetail(true);
    try {
      const detail = await fetchAdminCustomerById(token, customerId);
      setCustomerDetail(detail);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load customer details.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedCustomerId(null);
    setCustomerDetail(null);
  };

  const handleOpenStatusModal = (customer: AdminCustomerItem, action: 'suspend' | 'activate') => {
    setTargetCustomer(customer);
    setActionType(action);
    setStatusReason('');
    setStatusModalError(null);
  };

  const handleCloseStatusModal = () => {
    setTargetCustomer(null);
    setStatusReason('');
    setStatusModalError(null);
  };

  const handleSubmitStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !targetCustomer) return;

    if (actionType === 'suspend' && statusReason.trim().length < 5) {
      setStatusModalError('A suspension reason of at least 5 characters is required.');
      return;
    }

    setIsSubmittingStatus(true);
    setStatusModalError(null);

    try {
      const updated = await updateAdminCustomerStatus(token, targetCustomer.id, {
        isActive: actionType === 'activate',
        reason: statusReason.trim() || undefined,
      });

      setActionSuccessMessage(
        `Customer ${updated.name} has been successfully ${
          actionType === 'activate' ? 'reactivated' : 'suspended'
        }.`
      );

      // Refresh customers and close modal
      handleCloseStatusModal();
      if (selectedCustomerId === targetCustomer.id) {
        setCustomerDetail(updated);
      }
      loadCustomers(pagination.page);

      setTimeout(() => setActionSuccessMessage(null), 5000);
    } catch (err: any) {
      setStatusModalError(err.message || `Failed to ${actionType} customer.`);
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
            <span>👥</span> Customer Management &amp; Account Governance
          </h2>
          <p className="text-xs text-dwellio-teal/70">
            Search customer records, inspect spend profiles, and manage account access suspension.
          </p>
        </div>
        <div className="text-xs font-semibold text-dwellio-teal/60">
          Total customers: <strong className="text-dwellio-teal">{pagination.total}</strong>
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
            placeholder="Search customer by name, email, or phone..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-dwellio-mint/40 rounded-xl focus:outline-hidden focus:border-dwellio-teal"
          />
          <span className="absolute left-3 top-2.5 text-xs text-dwellio-teal/40">🔍</span>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
          {(['all', 'active', 'suspended'] as const).map((status) => (
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

      {/* Customers Table */}
      <div className="bg-white rounded-2xl border border-dwellio-mint/40 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-dwellio-teal border-t-transparent mb-3" />
            <p className="text-xs text-dwellio-teal/70">Loading customer accounts...</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="py-12 text-center text-xs text-dwellio-teal/60 italic">
            No customers found matching the search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-dwellio-teal border-collapse">
              <thead>
                <tr className="bg-dwellio-ivory/80 border-b border-dwellio-mint/30 font-bold">
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Bookings</th>
                  <th className="py-3 px-4 text-right">Lifetime Spend</th>
                  <th className="py-3 px-4">Joined</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dwellio-mint/20">
                {customers.map((c) => {
                  const isCurrentAdmin = currentUser?.id === c.id;
                  return (
                    <tr key={c.id} className="hover:bg-dwellio-ivory/30 transition">
                      <td className="py-3 px-4 font-bold">{c.name}</td>
                      <td className="py-3 px-4 text-dwellio-teal/70">
                        <div>{c.email}</div>
                        {c.phone && <div className="text-[11px] text-dwellio-teal/50">{c.phone}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            c.isActive
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {c.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold">{c.totalBookings}</td>
                      <td className="py-3 px-4 text-right font-black text-dwellio-teal">
                        ₹{(c.totalSpent ?? c.totalRecordedSpend ?? 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4 text-dwellio-teal/60 whitespace-nowrap">
                        {new Date(c.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(c.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-dwellio-teal hover:bg-dwellio-mint/30 rounded-lg transition"
                        >
                          Details
                        </button>

                        {!isCurrentAdmin && (
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenStatusModal(c, c.isActive ? 'suspend' : 'activate')
                            }
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                              c.isActive
                                ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200'
                                : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                            }`}
                          >
                            {c.isActive ? 'Suspend' : 'Reactivate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
                onClick={() => loadCustomers(pagination.page - 1)}
                className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
              >
                &larr; Prev
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadCustomers(pagination.page + 1)}
                className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Customer Detail Modal */}
      {selectedCustomerId && (
        <div className="fixed inset-0 z-50 bg-dwellio-teal/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-dwellio-mint/50 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-dwellio-mint/20 pb-3">
              <div>
                <h3 className="text-base font-bold text-dwellio-teal">Customer Profile &amp; Spend Overview</h3>
                <p className="text-xs text-dwellio-teal/60">Comprehensive account and booking analytics</p>
              </div>
              <button
                type="button"
                onClick={handleCloseDetail}
                className="text-dwellio-teal/60 hover:text-dwellio-teal text-xl font-bold"
              >
                ✕
              </button>
            </div>

            {isLoadingDetail || !customerDetail ? (
              <div className="py-12 text-center text-xs text-dwellio-teal/60">
                Loading detailed customer records...
              </div>
            ) : (
              <div className="space-y-4">
                {/* Customer Snapshot */}
                <div className="p-4 bg-dwellio-ivory/50 rounded-2xl border border-dwellio-mint/40 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-dwellio-teal/60">Full Name</span>
                    <div className="font-bold text-dwellio-teal">{customerDetail.name}</div>
                  </div>
                  <div>
                    <span className="text-dwellio-teal/60">Email</span>
                    <div className="font-bold text-dwellio-teal">{customerDetail.email}</div>
                  </div>
                  <div>
                    <span className="text-dwellio-teal/60">Account Status</span>
                    <div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          customerDetail.isActive
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {customerDetail.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-dwellio-teal/60">Member Since</span>
                    <div className="font-bold text-dwellio-teal">
                      {new Date(customerDetail.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {/* Suspension Info Banner if Suspended */}
                {!customerDetail.isActive && customerDetail.suspensionReason && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1">
                    <div className="font-bold text-rose-800">Account Suspension Notice:</div>
                    <div className="text-rose-700 italic">"{customerDetail.suspensionReason}"</div>
                    {customerDetail.suspendedAt && (
                      <div className="text-[10px] text-rose-600">
                        Suspended on: {new Date(customerDetail.suspendedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}

                {/* Lifetime Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-white border border-dwellio-mint/40 rounded-xl">
                    <span className="text-xs text-dwellio-teal/60">Lifetime Spend</span>
                    <div className="text-xl font-black text-dwellio-teal mt-1">
                      ₹{(customerDetail.totalSpent ?? customerDetail.totalRecordedSpend ?? 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="p-3 bg-white border border-dwellio-mint/40 rounded-xl">
                    <span className="text-xs text-dwellio-teal/60">Total Bookings</span>
                    <div className="text-xl font-black text-dwellio-teal mt-1">
                      {customerDetail.totalBookings}
                    </div>
                  </div>
                  <div className="p-3 bg-white border border-dwellio-mint/40 rounded-xl">
                    <span className="text-xs text-dwellio-teal/60">Completed Jobs</span>
                    <div className="text-xl font-black text-emerald-700 mt-1">
                      {customerDetail.bookingStatusCounts?.completed ||
                        (customerDetail as any).bookingsByStatus?.completed ||
                        0}
                    </div>
                  </div>
                </div>

                {/* Recent Bookings List */}
                <div>
                  <h4 className="text-xs font-bold text-dwellio-teal mb-2">Recent Booking History</h4>
                  {customerDetail.recentBookings.length === 0 ? (
                    <p className="text-xs text-dwellio-teal/60 italic py-3">No bookings placed yet.</p>
                  ) : (
                    <div className="divide-y divide-dwellio-mint/20 border border-dwellio-mint/30 rounded-xl overflow-hidden">
                      {customerDetail.recentBookings.map((b) => (
                        <div key={b.id} className="p-3 bg-white flex items-center justify-between text-xs">
                          <div>
                            <div className="font-bold text-dwellio-teal">
                              {b.service?.name || (b as any).serviceName || 'Service'}
                            </div>
                            <div className="text-[11px] text-dwellio-teal/60">
                              Pro: {b.provider?.displayName || (b as any).providerDisplayName || 'Provider'} &bull;{' '}
                              {new Date(b.scheduledStartTime).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-dwellio-teal">
                              ₹{b.priceSnapshot ?? (b as any).price ?? 499}
                            </span>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-dwellio-teal/70">
                                {b.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Suspension / Reactivation Modal */}
      {targetCustomer && (
        <div className="fixed inset-0 z-50 bg-dwellio-teal/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-dwellio-mint/50 p-6 max-w-md w-full shadow-xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-dwellio-teal">
                {actionType === 'suspend' ? 'Confirm Account Suspension' : 'Confirm Account Reactivation'}
              </h3>
              <p className="text-xs text-dwellio-teal/70 mt-1">
                {actionType === 'suspend'
                  ? `Suspending ${targetCustomer.name} will terminate active login sessions and block new booking requests.`
                  : `Reactivating ${targetCustomer.name} will restore account login privileges.`}
              </p>
            </div>

            {statusModalError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl">
                ✕ {statusModalError}
              </div>
            )}

            <form onSubmit={handleSubmitStatusChange} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-dwellio-teal mb-1">
                  Reason for {actionType === 'suspend' ? 'Suspension' : 'Reactivation'}{' '}
                  {actionType === 'suspend' && <span className="text-rose-600">*</span>}
                </label>
                <textarea
                  rows={3}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder={
                    actionType === 'suspend'
                      ? 'E.g., Repeated booking non-payment or fraudulent behavior...'
                      : 'E.g., Account verified and resolved support inquiry...'
                  }
                  required={actionType === 'suspend'}
                  className="w-full p-2.5 text-xs border border-dwellio-mint/40 rounded-xl focus:outline-hidden focus:border-dwellio-teal"
                />
                <span className="text-[10px] text-dwellio-teal/60">
                  {actionType === 'suspend' ? 'Minimum 5 characters required for audit trail' : 'Optional reason'}
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
                    actionType === 'suspend'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isSubmittingStatus
                    ? 'Processing...'
                    : actionType === 'suspend'
                    ? 'Suspend Account'
                    : 'Reactivate Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { ProviderVerificationStatus, PaginationMeta } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import {
  fetchAdminApplications,
  approveAdminApplication,
  rejectAdminApplication,
  AdminProviderApplicationItem,
} from '../../services/adminService';

export const AdminProvidersView: React.FC = () => {
  const { token } = useAuth();
  const [applications, setApplications] = useState<AdminProviderApplicationItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [selectedStatus, setSelectedStatus] = useState<ProviderVerificationStatus | 'all'>('pending');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Modal states
  const [approvingApp, setApprovingApp] = useState<AdminProviderApplicationItem | null>(null);
  const [rejectingApp, setRejectingApp] = useState<AdminProviderApplicationItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadApplications = useCallback(
    async (pageToLoad = pagination.page) => {
      if (!token) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetchAdminApplications(token, {
          page: pageToLoad,
          limit: 10,
          status: selectedStatus === 'all' ? undefined : selectedStatus,
        });
        setApplications(res.items);
        setPagination(res.pagination);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load provider applications.');
      } finally {
        setIsLoading(false);
      }
    },
    [token, selectedStatus, pagination.page]
  );

  useEffect(() => {
    loadApplications(1);
  }, [selectedStatus]);

  const handleApproveConfirm = async () => {
    if (!token || !approvingApp) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      await approveAdminApplication(token, approvingApp.id);
      setActionSuccessMessage(`Successfully approved application for ${approvingApp.displayName}.`);
      setApprovingApp(null);
      await loadApplications();
    } catch (err: any) {
      setModalError(err.message || 'Failed to approve provider application.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!token || !rejectingApp) return;
    const trimmed = rejectionReason.trim();
    if (trimmed.length < 5 || trimmed.length > 500) {
      setModalError('Please enter a rejection reason between 5 and 500 characters.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);
    try {
      await rejectAdminApplication(token, rejectingApp.id, trimmed);
      setActionSuccessMessage(`Application for ${rejectingApp.displayName} was rejected.`);
      setRejectingApp(null);
      setRejectionReason('');
      await loadApplications();
    } catch (err: any) {
      setModalError(err.message || 'Failed to reject provider application.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-dwellio-teal">Provider Application Management</h2>
          <p className="text-xs text-dwellio-teal/70">
            Review, verify credentials, and onboard home service professionals to Dwellio.
          </p>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-dwellio-mint/50">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setSelectedStatus(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition capitalize ${
                selectedStatus === status
                  ? 'bg-dwellio-teal text-white shadow-xs'
                  : 'text-dwellio-teal/70 hover:text-dwellio-teal'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Action Success Alert */}
      {actionSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-xs text-emerald-900">
          <span>{actionSuccessMessage}</span>
          <button
            type="button"
            onClick={() => setActionSuccessMessage(null)}
            className="font-bold hover:underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

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
          <p className="text-sm font-semibold text-dwellio-teal/70">Loading applications...</p>
        </div>
      ) : applications.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-dwellio-mint/40">
          <p className="text-sm font-bold text-dwellio-teal">No applications found</p>
          <p className="text-xs text-dwellio-teal/60 mt-1">
            There are currently no provider applications matching the "{selectedStatus}" filter.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dwellio-mint/40 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-dwellio-teal">
              <thead className="bg-dwellio-ivory/50 border-b border-dwellio-mint/30 font-bold">
                <tr>
                  <th className="py-3 px-4">Provider / Applicant</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Service Area & Skills</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Applied</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dwellio-mint/20">
                {applications.map((app) => (
                  <tr key={app.id} className="hover:bg-dwellio-ivory/20 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-dwellio-teal">{app.displayName}</div>
                      {app.user && (
                        <div className="text-[11px] text-dwellio-teal/60">{app.user.name}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div>{app.phone}</div>
                      {app.user && (
                        <div className="text-[11px] text-dwellio-teal/60">{app.user.email}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold">{app.serviceArea}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {app.skills.map((skill) => (
                          <span
                            key={skill}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-dwellio-mint/30 text-dwellio-teal font-medium"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                          app.verificationStatus === 'approved'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : app.verificationStatus === 'rejected'
                            ? 'bg-rose-50 text-rose-800 border-rose-300'
                            : 'bg-amber-50 text-amber-800 border-amber-300'
                        }`}
                      >
                        {app.verificationStatus}
                      </span>
                      {app.verificationStatus === 'rejected' && app.rejectionReason && (
                        <p className="mt-1 text-[11px] text-rose-700 italic max-w-xs">
                          Reason: {app.rejectionReason}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-dwellio-teal/60">
                      {new Date(app.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {app.verificationStatus === 'pending' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setApprovingApp(app);
                              setModalError(null);
                            }}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingApp(app);
                              setRejectionReason('');
                              setModalError(null);
                            }}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-dwellio-teal/40 font-medium">Completed</span>
                      )}
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
                  onClick={() => loadApplications(pagination.page - 1)}
                  className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => loadApplications(pagination.page + 1)}
                  className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Approve Confirmation Modal */}
      {approvingApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-dwellio-mint/40 space-y-4">
            <h3 className="text-base font-bold text-dwellio-teal">Approve Provider Application</h3>
            <p className="text-xs text-dwellio-teal/70">
              Are you sure you want to approve{' '}
              <strong className="text-dwellio-teal">{approvingApp.displayName}</strong>? This will elevate
              their user account to the provider role and allow them to offer services on Dwellio.
            </p>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                {modalError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setApprovingApp(null)}
                className="px-4 py-2 border border-dwellio-mint/50 rounded-xl text-xs font-bold text-dwellio-teal hover:bg-dwellio-ivory transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleApproveConfirm}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                {isSubmitting ? 'Approving...' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectingApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-dwellio-mint/40 space-y-4">
            <h3 className="text-base font-bold text-dwellio-teal">Reject Provider Application</h3>
            <p className="text-xs text-dwellio-teal/70">
              Provide a clear reason for rejecting{' '}
              <strong className="text-dwellio-teal">{rejectingApp.displayName}</strong>. This feedback is
              permanently stored and visible on the application record.
            </p>

            <div>
              <label className="block text-xs font-bold text-dwellio-teal mb-1">
                Rejection Reason (5–500 characters) *
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., Incomplete trade license documentation or outside service area."
                rows={3}
                className="w-full text-xs p-3 border border-dwellio-mint/60 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-500/30"
              />
              <div className="text-[11px] text-dwellio-teal/50 text-right mt-1">
                {rejectionReason.length}/500 characters
              </div>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                {modalError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setRejectingApp(null)}
                className="px-4 py-2 border border-dwellio-mint/50 rounded-xl text-xs font-bold text-dwellio-teal hover:bg-dwellio-ivory transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleRejectConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                {isSubmitting ? 'Rejecting...' : 'Reject Application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

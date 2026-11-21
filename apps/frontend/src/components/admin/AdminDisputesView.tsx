import React, { useState, useEffect, useCallback } from 'react';
import { DisputeData, PaginationMeta, ResolveDisputePayload } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import {
  fetchAdminDisputes,
  fetchAdminDisputeById,
  resolveAdminDispute,
} from '../../services/adminService';

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  open: { label: 'Open', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  under_review: {
    label: 'Under Review',
    bg: 'bg-purple-50',
    text: 'text-purple-800',
    border: 'border-purple-200',
  },
  resolved: {
    label: 'Resolved',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
  },
  dismissed: {
    label: 'Dismissed',
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200',
  },
};

export const AdminDisputesView: React.FC = () => {
  const { token } = useAuth();
  const [disputes, setDisputes] = useState<DisputeData[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Review / Resolve Modal
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);
  const [disputeDetail, setDisputeDetail] = useState<DisputeData | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [resolutionStatus, setResolutionStatus] = useState<'under_review' | 'resolved' | 'dismissed'>('resolved');
  const [resolutionReason, setResolutionReason] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [isSubmittingResolution, setIsSubmittingResolution] = useState<boolean>(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  const loadDisputes = useCallback(
    async (pageToLoad = 1) => {
      if (!token) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetchAdminDisputes(token, {
          page: pageToLoad,
          limit: 10,
          status: statusFilter === 'all' ? undefined : statusFilter,
        });
        setDisputes(res.items);
        setPagination(res.pagination);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load disputes.');
      } finally {
        setIsLoading(false);
      }
    },
    [token, statusFilter]
  );

  useEffect(() => {
    loadDisputes(1);
  }, [loadDisputes]);

  const handleOpenReview = async (disputeId: string) => {
    if (!token) return;
    setSelectedDisputeId(disputeId);
    setIsLoadingDetail(true);
    setResolutionError(null);
    setResolutionReason('');
    setAdminNotes('');
    try {
      const data = await fetchAdminDisputeById(token, disputeId);
      setDisputeDetail(data);
      if (data.status === 'open') {
        setResolutionStatus('resolved');
      } else {
        setResolutionStatus(data.status as any);
      }
    } catch (err: any) {
      setResolutionError(err.message || 'Failed to load dispute details.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCloseReview = () => {
    setSelectedDisputeId(null);
    setDisputeDetail(null);
    setResolutionError(null);
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedDisputeId) return;

    if (
      (resolutionStatus === 'resolved' || resolutionStatus === 'dismissed') &&
      resolutionReason.trim().length < 5
    ) {
      setResolutionError('A resolution reason of at least 5 characters is required.');
      return;
    }

    setIsSubmittingResolution(true);
    setResolutionError(null);
    try {
      const payload: ResolveDisputePayload = {
        status: resolutionStatus,
        resolutionReason: resolutionReason.trim() || undefined,
        adminNotes: adminNotes.trim() || undefined,
      };

      const updated = await resolveAdminDispute(token, selectedDisputeId, payload);
      setActionSuccessMessage(
        `Dispute #${updated.id.slice(-6)} has been set to "${updated.status}".`
      );
      handleCloseReview();
      loadDisputes(pagination.page);

      setTimeout(() => setActionSuccessMessage(null), 5000);
    } catch (err: any) {
      setResolutionError(err.message || 'Failed to update dispute status.');
    } finally {
      setIsSubmittingResolution(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-dwellio-teal flex items-center gap-2">
            <span>⚖️</span> Dispute Resolution &amp; Arbitration
          </h2>
          <p className="text-xs text-dwellio-teal/70">
            Impartial adjudication of service quality conflicts between customers and service providers.
          </p>
        </div>
        <div className="text-xs font-semibold text-dwellio-teal/60">
          Total disputes: <strong className="text-dwellio-teal">{pagination.total}</strong>
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

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 bg-white p-2 rounded-2xl border border-dwellio-mint/40 shadow-xs">
        {(['all', 'open', 'under_review', 'resolved', 'dismissed'] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl capitalize transition whitespace-nowrap ${
              statusFilter === status
                ? 'bg-dwellio-teal text-white shadow-xs'
                : 'bg-dwellio-ivory text-dwellio-teal/70 hover:bg-dwellio-mint/30'
            }`}
          >
            {status.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Disputes Table */}
      <div className="bg-white rounded-2xl border border-dwellio-mint/40 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-dwellio-teal border-t-transparent mb-3" />
            <p className="text-xs text-dwellio-teal/70">Loading active disputes...</p>
          </div>
        ) : disputes.length === 0 ? (
          <div className="py-12 text-center text-xs text-dwellio-teal/60 italic">
            No disputes found matching this status filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-dwellio-teal border-collapse">
              <thead>
                <tr className="bg-dwellio-ivory/80 border-b border-dwellio-mint/30 font-bold">
                  <th className="py-3 px-4">Dispute ID</th>
                  <th className="py-3 px-4">Booking</th>
                  <th className="py-3 px-4">Initiator</th>
                  <th className="py-3 px-4">Reason Category</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Raised On</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dwellio-mint/20">
                {disputes.map((d) => {
                  const cfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.open;
                  return (
                    <tr key={d.id} className="hover:bg-dwellio-ivory/30 transition">
                      <td className="py-3 px-4 font-mono font-bold">#{d.id.slice(-6)}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-dwellio-teal/70">
                        #{d.bookingId.slice(-6)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold capitalize">{d.raisedByRole || d.initiatorRole}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-dwellio-ivory border border-dwellio-mint/50">
                          {(d.category || d.reason || 'service_quality').replace(/_/g, ' ')}
                        </span>
                        <div className="text-[11px] text-dwellio-teal/60 line-clamp-1 mt-0.5">
                          {d.description}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}
                        >
                          {cfg.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-dwellio-teal/60 whitespace-nowrap">
                        {new Date(d.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenReview(d.id)}
                          className="px-3 py-1 bg-dwellio-teal hover:bg-dwellio-teal/90 text-white font-bold rounded-lg transition"
                        >
                          {d.status === 'resolved' || d.status === 'dismissed' || d.status === 'rejected'
                            ? 'Details'
                            : 'Adjudicate'}
                        </button>
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
                onClick={() => loadDisputes(pagination.page - 1)}
                className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
              >
                &larr; Prev
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadDisputes(pagination.page + 1)}
                className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Review / Adjudication Modal */}
      {selectedDisputeId && (
        <div className="fixed inset-0 z-50 bg-dwellio-teal/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-dwellio-mint/50 p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-dwellio-mint/20 pb-3">
              <div>
                <h3 className="text-base font-bold text-dwellio-teal">
                  Dispute Review: #{selectedDisputeId.slice(-6)}
                </h3>
                <p className="text-xs text-dwellio-teal/60">
                  Adjudicate case findings and issue platform determination
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseReview}
                className="text-dwellio-teal/60 hover:text-dwellio-teal text-xl font-bold"
              >
                ✕
              </button>
            </div>

            {isLoadingDetail || !disputeDetail ? (
              <div className="py-12 text-center text-xs text-dwellio-teal/60">
                Fetching dispute case file...
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {/* Dispute Facts */}
                <div className="p-3 bg-dwellio-ivory rounded-xl border border-dwellio-mint/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-dwellio-teal">
                      Initiated by: <span className="capitalize">{disputeDetail.raisedByRole || disputeDetail.initiatorRole}</span>
                    </span>
                    <span className="font-mono text-dwellio-teal/70">
                      Booking: #{disputeDetail.bookingId.slice(-6)}
                    </span>
                  </div>
                  <div>
                    <span className="text-dwellio-teal/60">Reason Category:</span>
                    <div className="font-bold text-dwellio-teal mt-0.5">
                      {(disputeDetail.category || disputeDetail.reason || 'service_quality').replace(/_/g, ' ')}
                    </div>
                  </div>
                  <div>
                    <span className="text-dwellio-teal/60">Statement of Conflict:</span>
                    <p className="p-2.5 bg-white rounded-lg border border-dwellio-mint/30 text-dwellio-teal mt-1">
                      {disputeDetail.description}
                    </p>
                  </div>
                </div>

                {/* Existing Resolution if Already Closed */}
                {disputeDetail.resolutionReason && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                    <div className="font-bold text-emerald-900">Arbitration Determination:</div>
                    <div className="text-emerald-800 italic">"{disputeDetail.resolutionReason}"</div>
                    {disputeDetail.resolvedAt && (
                      <div className="text-[10px] text-emerald-700">
                        Resolved at: {new Date(disputeDetail.resolvedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}

                {/* Adjudication Form */}
                <form onSubmit={handleResolveSubmit} className="space-y-3 pt-2">
                  {resolutionError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl">
                      ✕ {resolutionError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-dwellio-teal mb-1">
                      Determination Verdict *
                    </label>
                    <select
                      value={resolutionStatus}
                      onChange={(e) => setResolutionStatus(e.target.value as any)}
                      className="w-full p-2 text-xs border border-dwellio-mint/60 rounded-xl focus:outline-hidden font-bold"
                    >
                      <option value="resolved">Resolved (In Favor of Initiator / Settlement)</option>
                      <option value="under_review">Mark Under Active Investigation</option>
                      <option value="dismissed">Dismissed (No Platform Fault / Claim Invalid)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-dwellio-teal mb-1">
                      Resolution Reason &amp; Order{' '}
                      {(resolutionStatus === 'resolved' || resolutionStatus === 'dismissed') && (
                        <span className="text-rose-600">*</span>
                      )}
                    </label>
                    <textarea
                      rows={3}
                      value={resolutionReason}
                      onChange={(e) => setResolutionReason(e.target.value)}
                      placeholder="E.g., Provider failed to complete plumbing checklist; full credit issued to customer wallet..."
                      required={resolutionStatus === 'resolved' || resolutionStatus === 'dismissed'}
                      className="w-full p-2.5 text-xs border border-dwellio-mint/40 rounded-xl focus:outline-hidden focus:border-dwellio-teal"
                    />
                    <span className="text-[10px] text-dwellio-teal/60">
                      Dispatched to both customer and provider notifications upon resolution
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-dwellio-teal mb-1">
                      Internal Admin Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Internal audit notes, insurance claims reference, or provider warning notes..."
                      className="w-full p-2.5 text-xs border border-dwellio-mint/40 rounded-xl focus:outline-hidden focus:border-dwellio-teal"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      disabled={isSubmittingResolution}
                      onClick={handleCloseReview}
                      className="px-4 py-2 border border-dwellio-mint/50 rounded-xl text-xs font-bold text-dwellio-teal hover:bg-dwellio-ivory transition"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingResolution}
                      className="px-4 py-2 bg-dwellio-teal hover:bg-dwellio-teal/90 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                    >
                      {isSubmittingResolution ? 'Submitting...' : 'Save Adjudication'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

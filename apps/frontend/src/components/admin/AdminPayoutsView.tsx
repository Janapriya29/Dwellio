import React, { useState, useEffect, useCallback } from 'react';
import type { PayoutBatchData, PaginationMeta } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import {
  listPayoutBatches,
  generatePayoutBatch,
  approvePayoutBatch,
  settlePayoutBatch,
} from '../../services/adminPayoutService';

export const AdminPayoutsView: React.FC = () => {
  const { token } = useAuth();

  const [batches, setBatches] = useState<PayoutBatchData[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });

  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [settlingBatchId, setSettlingBatchId] = useState<string | null>(null);
  const [settleReferenceNote, setSettleReferenceNote] = useState<string>('');
  const [isSettling, setIsSettling] = useState<boolean>(false);

  const loadBatches = useCallback(
    async (page: number = 1, status: string = 'all') => {
      if (!token) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await listPayoutBatches(token, page, 15, status);
        setBatches(data.batches);
        setPagination(data.pagination);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load payout batches.');
      } finally {
        setIsLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    loadBatches(1, selectedStatus);
  }, [loadBatches, selectedStatus]);

  const handleGenerateBatch = async () => {
    if (!token) return;
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const res = await generatePayoutBatch(token);
      setSuccessMessage(
        `Generated Payout Batch ${res.batch.batchNumber}: ₹${res.totalAllocatedRupees.toLocaleString(
          'en-IN'
        )} across ${res.providerCount} providers.`
      );
      loadBatches(1, selectedStatus);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate payout batch.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApproveBatch = async (batchId: string) => {
    if (!token) return;
    try {
      const updated = await approvePayoutBatch(batchId, token);
      setSuccessMessage(`Payout Batch ${updated.batchNumber} has been approved.`);
      setBatches((prev) => prev.map((b) => (b.id === batchId ? updated : b)));
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to approve payout batch.');
    }
  };

  const handleSettleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !settlingBatchId) return;

    setIsSettling(true);
    try {
      const updated = await settlePayoutBatch(
        settlingBatchId,
        token,
        settleReferenceNote.trim() || undefined
      );
      setSuccessMessage(`Payout Batch ${updated.batchNumber} has been marked as Settled.`);
      setSettlingBatchId(null);
      setSettleReferenceNote('');
      setBatches((prev) => prev.map((b) => (b.id === settlingBatchId ? updated : b)));
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to settle payout batch.');
    } finally {
      setIsSettling(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'settled':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'approved':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'processing':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'draft':
      default:
        return 'bg-amber-100 text-amber-800 border-amber-300';
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-dwellio-teal/60">
            Treasury &amp; Disbursements
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-dwellio-teal tracking-tight">
            Weekly Provider Payouts
          </h2>
          <p className="text-xs text-dwellio-teal/70 mt-1">
            Generate, review, approve, and track weekly bank disbursements to verified service providers.
          </p>
        </div>

        <button
          type="button"
          disabled={isGenerating}
          onClick={handleGenerateBatch}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-dwellio-teal text-white text-xs font-bold hover:bg-dwellio-teal/90 shadow transition self-start sm:self-auto disabled:opacity-50"
        >
          <span>⚡</span>
          <span>{isGenerating ? 'Calculating Allocations...' : 'Generate Weekly Payout Batch'}</span>
        </button>
      </div>

      {/* Alerts */}
      {successMessage && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span className="font-bold">{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-700 hover:text-emerald-900 font-bold">
            ✕
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => loadBatches(pagination.page, selectedStatus)} className="px-3 py-1 bg-rose-600 text-white rounded font-bold hover:bg-rose-700 transition">
            Retry
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-6">
        {['all', 'draft', 'approved', 'settled'].map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setSelectedStatus(st)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold capitalize transition ${
              selectedStatus === st
                ? 'bg-dwellio-teal text-white shadow-xs'
                : 'bg-white text-dwellio-teal/75 border border-dwellio-mint/60 hover:bg-dwellio-ivory'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Batches Table */}
      <div className="bg-white rounded-3xl border border-dwellio-mint/50 overflow-hidden shadow-xs">
        <div className="p-5 border-b border-dwellio-mint/30 flex items-center justify-between">
          <h3 className="text-base font-bold text-dwellio-teal">Disbursement Batches</h3>
          <span className="text-xs text-dwellio-teal/60">Total: {pagination.total}</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-dwellio-teal/60 animate-pulse">
            Loading payout batches...
          </div>
        ) : batches.length === 0 ? (
          <div className="p-12 text-center text-xs text-dwellio-teal/60">
            No payout batches found. Click &quot;Generate Weekly Payout Batch&quot; to aggregate available provider earnings.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-dwellio-teal">
              <thead className="bg-dwellio-ivory/80 text-[10px] font-bold uppercase tracking-wider text-dwellio-teal/70 border-b border-dwellio-mint/30">
                <tr>
                  <th className="py-3 px-4">Batch Number</th>
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4 text-center">Providers</th>
                  <th className="py-3 px-4 text-right">Gross Total</th>
                  <th className="py-3 px-4 text-right">Commission Retained</th>
                  <th className="py-3 px-4 text-right">Net Disbursement</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dwellio-mint/20">
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-dwellio-ivory/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-dwellio-teal">
                      {batch.batchNumber}
                    </td>
                    <td className="py-3.5 px-4 text-dwellio-teal/70 whitespace-nowrap">
                      {new Date(batch.periodStart).toLocaleDateString()} –{' '}
                      {new Date(batch.periodEnd).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold">
                      {batch.totalProviders ?? batch.totalProvidersCount ?? 0}
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium text-dwellio-teal/70">
                      ₹{(batch.totalGrossRupees ?? 0).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium text-amber-700">
                      ₹{(batch.totalCommissionRupees ?? 0).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-dwellio-teal text-sm">
                      ₹{(batch.totalNetPayoutRupees ?? batch.totalAmountRupees ?? 0).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getStatusBadge(
                          batch.status
                        )}`}
                      >
                        {batch.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      {batch.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => handleApproveBatch(batch.id)}
                          className="px-3 py-1 rounded-xl text-xs font-bold bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100 transition"
                        >
                          Approve Batch
                        </button>
                      )}
                      {batch.status === 'approved' && (
                        <button
                          type="button"
                          onClick={() => setSettlingBatchId(batch.id)}
                          className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 transition"
                        >
                          Mark Settled
                        </button>
                      )}
                      {batch.status === 'settled' && (
                        <span className="text-[11px] text-emerald-700 font-bold">
                          ✓ Settled ({batch.settledAt ? new Date(batch.settledAt).toLocaleDateString() : 'Done'})
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-dwellio-mint/30 flex items-center justify-between text-xs text-dwellio-teal">
            <button
              disabled={pagination.page <= 1}
              onClick={() => loadBatches(pagination.page - 1, selectedStatus)}
              className="px-3.5 py-1.5 rounded-xl border border-slate-300 font-bold hover:bg-slate-50 disabled:opacity-40 transition"
            >
              Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => loadBatches(pagination.page + 1, selectedStatus)}
              className="px-3.5 py-1.5 rounded-xl border border-slate-300 font-bold hover:bg-slate-50 disabled:opacity-40 transition"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Settle Modal */}
      {settlingBatchId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-dwellio-mint/60">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-dwellio-mint/30">
              <h3 className="text-base font-bold text-dwellio-teal">
                Confirm Batch Settlement
              </h3>
              <button
                type="button"
                onClick={() => setSettlingBatchId(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-dwellio-teal/70 mb-4">
              Marking this batch as settled will update all included provider earnings ledger entries to &quot;settled&quot; status and send confirmation notifications to all disbursed providers.
            </p>

            <form onSubmit={handleSettleBatchSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                  Bank Reference / UTR Number (Optional)
                </label>
                <input
                  type="text"
                  value={settleReferenceNote}
                  onChange={(e) => setSettleReferenceNote(e.target.value)}
                  placeholder="e.g. UTR-HDFC-982348123"
                  className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal font-mono focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-dwellio-mint/30">
                <button
                  type="button"
                  onClick={() => setSettlingBatchId(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSettling}
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow transition disabled:opacity-50"
                >
                  {isSettling ? 'Confirming...' : 'Confirm Bank Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

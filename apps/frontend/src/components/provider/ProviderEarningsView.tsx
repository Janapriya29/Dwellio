import React, { useState, useEffect, useCallback } from 'react';
import type {
  ProviderEarningsSummaryData,
  ProviderLedgerEntryData,
  PaginationMeta,
  UpdateProviderPayoutAccountPayload,
} from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import {
  fetchProviderEarningsSummary,
  fetchProviderLedger,
  updateProviderPayoutAccount,
} from '../../services/providerPayoutService';

export const ProviderEarningsView: React.FC = () => {
  const { token } = useAuth();

  const [summary, setSummary] = useState<ProviderEarningsSummaryData | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<ProviderLedgerEntryData[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Payout Account Modal state
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [accountType, setAccountType] = useState<'bank_account' | 'upi'>('bank_account');
  const [accountHolderName, setAccountHolderName] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [ifscCode, setIfscCode] = useState<string>('');
  const [upiId, setUpiId] = useState<string>('');
  const [isSavingAccount, setIsSavingAccount] = useState<boolean>(false);
  const [accountFormError, setAccountFormError] = useState<string | null>(null);

  const loadData = useCallback(async (page: number = 1) => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [sum, ledger] = await Promise.all([
        fetchProviderEarningsSummary(token),
        fetchProviderLedger(token, page, 15),
      ]);
      setSummary(sum);
      setLedgerEntries(ledger.entries);
      setPagination(ledger.pagination);

      // Pre-fill account form if existing
      if (sum.payoutAccount) {
        setAccountType(sum.payoutAccount.accountType || 'bank_account');
        setAccountHolderName(sum.payoutAccount.accountHolderName || '');
        setBankName(sum.payoutAccount.bankName || '');
        setIfscCode(sum.payoutAccount.ifscCode || '');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load earnings data.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData(1);
  }, [loadData]);

  const handleSavePayoutAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setAccountFormError(null);
    setIsSavingAccount(true);

    try {
      const payload: UpdateProviderPayoutAccountPayload = {
        accountType,
        accountHolderName: accountHolderName.trim(),
        bankName: accountType === 'bank_account' ? bankName.trim() : undefined,
        accountNumber: accountType === 'bank_account' ? accountNumber.trim() : undefined,
        ifscCode: accountType === 'bank_account' ? ifscCode.trim().toUpperCase() : undefined,
        upiId: accountType === 'upi' ? upiId.trim() : undefined,
      };

      await updateProviderPayoutAccount(payload, token);
      setSuccessMessage('Payout banking details updated successfully.');
      setIsAccountModalOpen(false);
      loadData(pagination.page);
    } catch (err: any) {
      setAccountFormError(err.message || 'Failed to update payout details.');
    } finally {
      setIsSavingAccount(false);
    }
  };

  const formatEntryType = (type: string) => {
    switch (type) {
      case 'job_earning_credit':
        return { label: 'Job Earnings Credit', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
      case 'platform_commission_deduction':
        return { label: 'Platform Commission', color: 'text-amber-700 bg-amber-50 border-amber-200' };
      case 'dispute_adjustment_debit':
        return { label: 'Dispute Clawback', color: 'text-rose-700 bg-rose-50 border-rose-200' };
      case 'refund_reversal_debit':
        return { label: 'Refund Reversal', color: 'text-purple-700 bg-purple-50 border-purple-200' };
      case 'payout_batch_allocation':
        return { label: 'Payout Batch Allocation', color: 'text-blue-700 bg-blue-50 border-blue-200' };
      default:
        return { label: type.replace(/_/g, ' '), color: 'text-slate-700 bg-slate-50 border-slate-200' };
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-dwellio-teal/60">
            Financial Dashboard
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-dwellio-teal tracking-tight">
            Earnings &amp; Payouts
          </h2>
          <p className="text-xs text-dwellio-teal/70 mt-1">
            Real-time ledger tracking job earnings, immutable commission deductions, and weekly settlements.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAccountModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dwellio-teal text-white text-xs font-bold hover:bg-dwellio-teal/90 shadow transition self-start sm:self-auto"
        >
          <span>🏦</span>
          <span>Configure Payout Account</span>
        </button>
      </div>

      {/* Notifications / Alerts */}
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
          <button onClick={() => loadData(pagination.page)} className="px-3 py-1 bg-rose-600 text-white rounded font-bold hover:bg-rose-700 transition">
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {/* Available Balance */}
        <div className="bg-white rounded-3xl p-5 border border-emerald-200 shadow-xs relative overflow-hidden">
          <div className="w-1.5 h-full bg-emerald-500 absolute left-0 top-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800/70 block mb-1">
            Available Balance
          </span>
          <div className="text-2xl font-black text-dwellio-teal">
            ₹{summary ? (summary.availableBalanceRupees ?? summary.pendingPayoutBalanceRupees ?? 0).toLocaleString('en-IN') : '0'}
          </div>
          <p className="text-[10px] text-emerald-700 font-medium mt-1">
            Eligible for next weekly payout
          </p>
        </div>

        {/* Lifetime Net */}
        <div className="bg-white rounded-3xl p-5 border border-dwellio-mint/60 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-dwellio-teal/60 block mb-1">
            Net Earned
          </span>
          <div className="text-2xl font-black text-dwellio-teal">
            ₹{summary ? summary.totalNetEarningsRupees.toLocaleString('en-IN') : '0'}
          </div>
          <p className="text-[10px] text-dwellio-teal/60 font-medium mt-1">
            After platform deductions
          </p>
        </div>

        {/* Gross Earnings */}
        <div className="bg-white rounded-3xl p-5 border border-dwellio-mint/60 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-dwellio-teal/60 block mb-1">
            Gross Bookings
          </span>
          <div className="text-2xl font-black text-dwellio-teal">
            ₹{summary ? summary.totalGrossEarningsRupees.toLocaleString('en-IN') : '0'}
          </div>
          <p className="text-[10px] text-dwellio-teal/60 font-medium mt-1">
            Completed service value
          </p>
        </div>

        {/* Commission Deducted */}
        <div className="bg-white rounded-3xl p-5 border border-dwellio-mint/60 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-dwellio-teal/60 block mb-1">
            Platform Fee
          </span>
          <div className="text-2xl font-black text-dwellio-teal">
            ₹{summary ? summary.totalCommissionDeductedRupees.toLocaleString('en-IN') : '0'}
          </div>
          <p className="text-[10px] text-dwellio-teal/60 font-medium mt-1">
            15% standard rate
          </p>
        </div>

        {/* Settled to Bank */}
        <div className="bg-white rounded-3xl p-5 border border-dwellio-mint/60 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-dwellio-teal/60 block mb-1">
            Settled to Bank
          </span>
          <div className="text-2xl font-black text-dwellio-teal">
            ₹{summary ? (summary.settledAmountRupees ?? summary.settledPayoutAmountRupees ?? 0).toLocaleString('en-IN') : '0'}
          </div>
          <p className="text-[10px] text-dwellio-teal/60 font-medium mt-1">
            Disbursed in batches
          </p>
        </div>
      </div>

      {/* Payout Account Status Card */}
      <div className="bg-dwellio-ivory/60 rounded-3xl p-6 border border-dwellio-mint/60 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-dwellio-teal/60 block mb-1">
            Active Disbursement Method
          </span>
          {summary?.payoutAccount?.isConfigured ? (
            <div className="flex items-center gap-3">
              <span className="text-xl">
                {summary.payoutAccount.accountType === 'upi' ? '📱' : '🏦'}
              </span>
              <div>
                <p className="text-sm font-bold text-dwellio-teal">
                  {summary.payoutAccount.accountType === 'upi'
                    ? `UPI ID: ${summary.payoutAccount.maskedUpiId || 'Configured'}`
                    : `${summary.payoutAccount.bankName || 'Bank Account'}: ${summary.payoutAccount.maskedAccountNumber || '••••••••'}`}
                </p>
                <p className="text-[11px] text-dwellio-teal/70">
                  Beneficiary: {summary.payoutAccount.accountHolderName}
                  {summary.payoutAccount.ifscCode && ` • IFSC: ${summary.payoutAccount.ifscCode}`}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-800 text-xs font-semibold">
              <span>⚠️</span>
              <span>No payout account configured yet. Please configure your bank account or UPI ID to receive weekly payouts.</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsAccountModalOpen(true)}
          className="px-4 py-2 rounded-xl text-xs font-bold border border-dwellio-teal text-dwellio-teal hover:bg-dwellio-teal hover:text-white transition self-start sm:self-auto"
        >
          {summary?.payoutAccount?.isConfigured ? 'Edit Details' : 'Set Up Now'}
        </button>
      </div>

      {/* Ledger Table Section */}
      <div className="bg-white rounded-3xl border border-dwellio-mint/50 overflow-hidden shadow-xs">
        <div className="p-5 border-b border-dwellio-mint/30 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-dwellio-teal">
              Earnings Ledger &amp; Transaction History
            </h3>
            <p className="text-xs text-dwellio-teal/60">
              Append-only audit trail of credits, deductions, and batch payouts.
            </p>
          </div>
          <span className="text-xs text-dwellio-teal/60 font-medium">
            Total entries: {pagination.total}
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-dwellio-teal/60 animate-pulse">
            Loading earnings ledger...
          </div>
        ) : ledgerEntries.length === 0 ? (
          <div className="p-12 text-center text-xs text-dwellio-teal/60">
            No ledger transactions recorded yet. Completed paid bookings will appear here automatically.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-dwellio-teal">
              <thead className="bg-dwellio-ivory/80 text-[10px] font-bold uppercase tracking-wider text-dwellio-teal/70 border-b border-dwellio-mint/30">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Credit</th>
                  <th className="py-3 px-4 text-right">Debit</th>
                  <th className="py-3 px-4 text-right">Net Change</th>
                  <th className="py-3 px-4 text-right">Balance</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dwellio-mint/20">
                {ledgerEntries.map((entry) => {
                  const typeBadge = formatEntryType(entry.entryType);
                  return (
                    <tr key={entry.id} className="hover:bg-dwellio-ivory/40 transition">
                      <td className="py-3.5 px-4 whitespace-nowrap text-dwellio-teal/70">
                        {new Date(entry.createdAt).toLocaleDateString()}{' '}
                        <span className="text-[10px] text-dwellio-teal/50">
                          {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${typeBadge.color}`}>
                          {typeBadge.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs truncate" title={entry.description}>
                        {entry.description}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-emerald-600 whitespace-nowrap">
                        {(entry.creditAmountRupees ?? 0) > 0 ? `+₹${(entry.creditAmountRupees ?? 0).toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-rose-600 whitespace-nowrap">
                        {(entry.debitAmountRupees ?? 0) > 0 ? `-₹${(entry.debitAmountRupees ?? 0).toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className={`py-3.5 px-4 text-right font-bold whitespace-nowrap ${(entry.netAmountRupees ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {(entry.netAmountRupees ?? 0) >= 0 ? `+₹${(entry.netAmountRupees ?? 0).toLocaleString('en-IN')}` : `-₹${Math.abs(entry.netAmountRupees ?? 0).toLocaleString('en-IN')}`}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-dwellio-teal whitespace-nowrap">
                        ₹{(entry.resultingBalanceRupees ?? 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          entry.status === 'settled'
                            ? 'bg-blue-100 text-blue-800'
                            : entry.status === 'allocated'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {entry.status}
                        </span>
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
          <div className="p-4 border-t border-dwellio-mint/30 flex items-center justify-between text-xs text-dwellio-teal">
            <button
              disabled={pagination.page <= 1}
              onClick={() => loadData(pagination.page - 1)}
              className="px-3.5 py-1.5 rounded-xl border border-slate-300 font-bold hover:bg-slate-50 disabled:opacity-40 transition"
            >
              Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => loadData(pagination.page + 1)}
              className="px-3.5 py-1.5 rounded-xl border border-slate-300 font-bold hover:bg-slate-50 disabled:opacity-40 transition"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Payout Account Setup / Update Modal */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-dwellio-mint/60">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-dwellio-mint/30">
              <h3 className="text-base font-bold text-dwellio-teal">
                Payout &amp; Banking Details
              </h3>
              <button
                type="button"
                onClick={() => setIsAccountModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {accountFormError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                {accountFormError}
              </div>
            )}

            <form onSubmit={handleSavePayoutAccount} className="space-y-4 text-xs">
              {/* Type Switcher */}
              <div>
                <label className="block text-[10px] font-bold text-dwellio-teal uppercase tracking-wider mb-1.5">
                  Disbursement Destination
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountType('bank_account')}
                    className={`py-2 px-3 rounded-xl font-bold border transition ${
                      accountType === 'bank_account'
                        ? 'bg-dwellio-teal text-white border-dwellio-teal'
                        : 'bg-dwellio-ivory/60 text-dwellio-teal/80 border-dwellio-mint/60 hover:bg-white'
                    }`}
                  >
                    Bank Account
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType('upi')}
                    className={`py-2 px-3 rounded-xl font-bold border transition ${
                      accountType === 'upi'
                        ? 'bg-dwellio-teal text-white border-dwellio-teal'
                        : 'bg-dwellio-ivory/60 text-dwellio-teal/80 border-dwellio-mint/60 hover:bg-white'
                    }`}
                  >
                    UPI ID
                  </button>
                </div>
              </div>

              {/* Beneficiary Name */}
              <div>
                <label className="block text-[10px] font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                  Account Holder Name *
                </label>
                <input
                  type="text"
                  required
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  placeholder="Official name matching bank account"
                  className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                />
              </div>

              {accountType === 'bank_account' ? (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                      Bank Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="E.g. HDFC Bank, ICICI Bank, SBI"
                      className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                      Account Number *
                    </label>
                    <input
                      type="password"
                      required
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="Enter full bank account number"
                      className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal font-mono focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                    />
                    <span className="text-[10px] text-dwellio-teal/50 block mt-0.5">
                      🔒 Stored masked in accordance with PCI-DSS guidelines.
                    </span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                      IFSC Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={ifscCode}
                      onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                      placeholder="11-character IFSC (e.g. HDFC0001234)"
                      maxLength={11}
                      className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal font-mono uppercase focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-[10px] font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                    Virtual Payment Address (UPI ID) *
                  </label>
                  <input
                    type="text"
                    required
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="e.g. username@okhdfcbank"
                    className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal font-mono focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-dwellio-mint/30">
                <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAccount}
                  className="px-5 py-2 rounded-xl bg-dwellio-teal text-white font-bold hover:bg-dwellio-teal/90 shadow transition disabled:opacity-50"
                >
                  {isSavingAccount ? 'Saving...' : 'Save Payout Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import type { CouponData, PaginationMeta, CreateCouponPayload } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import {
  listAdminCoupons,
  createAdminCoupon,
  toggleAdminCouponStatus,
} from '../../services/couponService';

export const AdminCouponsView: React.FC = () => {
  const { token } = useAuth();

  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Create Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [code, setCode] = useState<string>('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState<number>(10);
  const [minOrderValueRupees, setMinOrderValueRupees] = useState<number>(500);
  const [maxDiscountAmountRupees, setMaxDiscountAmountRupees] = useState<number | undefined>(200);
  const [usageLimit, setUsageLimit] = useState<number | undefined>(100);
  const [validFrom, setValidFrom] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadCoupons = useCallback(
    async (page: number = 1, query?: string) => {
      if (!token) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await listAdminCoupons(token, page, 15, query);
        setCoupons(data.coupons);
        setPagination(data.pagination);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load coupons.');
      } finally {
        setIsLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    loadCoupons(1, searchQuery);
  }, [loadCoupons, searchQuery]);

  const handleToggleStatus = async (couponId: string) => {
    if (!token) return;
    try {
      const res = await toggleAdminCouponStatus(couponId, token);
      setCoupons((prev) =>
        prev.map((c) => (c.id === couponId ? { ...c, isActive: res.isActive } : c))
      );
      setSuccessMessage(`Coupon "${res.code}" is now ${res.isActive ? 'Active' : 'Inactive'}.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to toggle coupon status.');
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setFormError(null);
    setIsSubmitting(true);

    try {
      const payload: CreateCouponPayload = {
        code: code.trim().toUpperCase(),
        discountType,
        discountValue,
        minOrderValueRupees,
        maxDiscountAmountRupees: discountType === 'percent' ? maxDiscountAmountRupees : undefined,
        usageLimit,
        validFrom: new Date(validFrom).toISOString(),
        validUntil: new Date(`${validUntil}T23:59:59.999Z`).toISOString(),
        isActive: true,
      };

      await createAdminCoupon(payload, token);
      setSuccessMessage(`Coupon "${payload.code}" created successfully.`);
      setIsCreateModalOpen(false);
      // Reset form
      setCode('');
      setDiscountValue(10);
      loadCoupons(1);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create coupon.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-dwellio-teal/60">
            Promotions &amp; Marketing
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-dwellio-teal tracking-tight">
            Coupons &amp; Discounts
          </h2>
          <p className="text-xs text-dwellio-teal/70 mt-1">
            Manage customer discount codes, validity windows, and usage caps.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dwellio-teal text-white text-xs font-bold hover:bg-dwellio-teal/90 shadow transition self-start sm:self-auto"
        >
          <span>➕</span>
          <span>Create New Coupon</span>
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
          <button onClick={() => loadCoupons(pagination.page, searchQuery)} className="px-3 py-1 bg-rose-600 text-white rounded font-bold hover:bg-rose-700 transition">
            Retry
          </button>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search coupons by code..."
          className="w-full sm:max-w-md rounded-2xl border border-dwellio-mint/60 bg-white px-4 py-2.5 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
        />
      </div>

      {/* Coupons Table */}
      <div className="bg-white rounded-3xl border border-dwellio-mint/50 overflow-hidden shadow-xs">
        <div className="p-5 border-b border-dwellio-mint/30 flex items-center justify-between">
          <h3 className="text-base font-bold text-dwellio-teal">Active &amp; Archived Coupons</h3>
          <span className="text-xs text-dwellio-teal/60">Total: {pagination.total}</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-dwellio-teal/60 animate-pulse">
            Loading promotional coupons...
          </div>
        ) : coupons.length === 0 ? (
          <div className="p-12 text-center text-xs text-dwellio-teal/60">
            No coupons found. Click &quot;Create New Coupon&quot; to configure your first promotional discount.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-dwellio-teal">
              <thead className="bg-dwellio-ivory/80 text-[10px] font-bold uppercase tracking-wider text-dwellio-teal/70 border-b border-dwellio-mint/30">
                <tr>
                  <th className="py-3 px-4">Coupon Code</th>
                  <th className="py-3 px-4">Discount</th>
                  <th className="py-3 px-4">Min. Order</th>
                  <th className="py-3 px-4">Max. Discount</th>
                  <th className="py-3 px-4">Redemptions</th>
                  <th className="py-3 px-4">Valid Window</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dwellio-mint/20">
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="hover:bg-dwellio-ivory/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-dwellio-teal">
                      <span className="bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                        {coupon.code}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold">
                      {coupon.discountType === 'percent'
                        ? `${coupon.discountValue}% OFF`
                        : `₹${coupon.discountValue} FLAT`}
                    </td>
                    <td className="py-3.5 px-4 text-dwellio-teal/70">
                      ₹{coupon.minOrderValueRupees || 0}
                    </td>
                    <td className="py-3.5 px-4 text-dwellio-teal/70">
                      {coupon.maxDiscountAmountRupees ? `₹${coupon.maxDiscountAmountRupees}` : '—'}
                    </td>
                    <td className="py-3.5 px-4 font-medium">
                      {coupon.usedCount} {coupon.usageLimit ? `/ ${coupon.usageLimit}` : 'used'}
                    </td>
                    <td className="py-3.5 px-4 text-dwellio-teal/60 whitespace-nowrap">
                      {new Date(coupon.validFrom).toLocaleDateString()} – {new Date(coupon.validUntil).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          coupon.isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {coupon.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(coupon.id)}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition border ${
                          coupon.isActive
                            ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                            : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {coupon.isActive ? 'Deactivate' : 'Activate'}
                      </button>
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
              onClick={() => loadCoupons(pagination.page - 1, searchQuery)}
              className="px-3.5 py-1.5 rounded-xl border border-slate-300 font-bold hover:bg-slate-50 disabled:opacity-40 transition"
            >
              Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => loadCoupons(pagination.page + 1, searchQuery)}
              className="px-3.5 py-1.5 rounded-xl border border-slate-300 font-bold hover:bg-slate-50 disabled:opacity-40 transition"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Create Coupon Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-xl border border-dwellio-mint/60">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-dwellio-mint/30">
              <h3 className="text-base font-bold text-dwellio-teal">
                Create Promotional Coupon
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateCoupon} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                  Coupon Code *
                </label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. FESTIVE20 or FLAT300"
                  className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs font-mono uppercase text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                    Discount Type *
                  </label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as any)}
                    className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal font-medium focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Flat Amount (₹)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                    Discount Value *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={discountType === 'percent' ? 100 : 10000}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal font-bold focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                    Min. Booking Amount (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={minOrderValueRupees}
                    onChange={(e) => setMinOrderValueRupees(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                  />
                </div>

                {discountType === 'percent' && (
                  <div>
                    <label className="block text-[10px] font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                      Max. Discount Ceiling (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={maxDiscountAmountRupees || ''}
                      onChange={(e) =>
                        setMaxDiscountAmountRupees(
                          e.target.value ? parseInt(e.target.value, 10) : undefined
                        )
                      }
                      placeholder="Optional ceiling (e.g. 500)"
                      className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                    Valid From *
                  </label>
                  <input
                    type="date"
                    required
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                    Valid Until *
                  </label>
                  <input
                    type="date"
                    required
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                  Global Usage Limit
                </label>
                <input
                  type="number"
                  min={1}
                  value={usageLimit || ''}
                  onChange={(e) =>
                    setUsageLimit(e.target.value ? parseInt(e.target.value, 10) : undefined)
                  }
                  placeholder="Total redemptions allowed across platform (e.g. 100)"
                  className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-dwellio-mint/30">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-dwellio-teal text-white font-bold hover:bg-dwellio-teal/90 shadow transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

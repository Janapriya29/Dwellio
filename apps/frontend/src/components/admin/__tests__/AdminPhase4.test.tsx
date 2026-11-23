import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminCouponsView } from '../AdminCouponsView';
import { AdminPayoutsView } from '../AdminPayoutsView';
import { AuthProvider } from '../../../context/AuthContext';
import * as couponService from '../../../services/couponService';
import * as adminPayoutService from '../../../services/adminPayoutService';

vi.mock('../../../services/couponService');
vi.mock('../../../services/adminPayoutService');

describe('Phase 4: Admin Coupons & Payouts Views', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AdminCouponsView', () => {
    it('renders coupons table and toggles active status', async () => {
      vi.mocked(couponService.listAdminCoupons).mockResolvedValue({
        coupons: [
          {
            id: 'cpn-1',
            code: 'FESTIVE25',
            discountType: 'percent' as const,
            discountValue: 25,
            minOrderValueRupees: 500,
            maxDiscountAmountRupees: 250,
            usageLimit: 100,
            usedCount: 14,
            validFrom: '2026-11-01T00:00:00.000Z',
            validUntil: '2026-12-01T00:00:00.000Z',
            isActive: true,
            createdAt: '2026-11-01T00:00:00.000Z',
            updatedAt: '2026-11-01T00:00:00.000Z',
          },
        ],
        pagination: { page: 1, limit: 15, total: 1, totalPages: 1 },
      });

      vi.mocked(couponService.toggleAdminCouponStatus).mockResolvedValue({
        id: 'cpn-1',
        code: 'FESTIVE25',
        isActive: false,
      });

      render(
        <AuthProvider>
          <AdminCouponsView />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('FESTIVE25')).toBeInTheDocument();
        expect(screen.getByText('25% OFF')).toBeInTheDocument();
        expect(screen.getByText('14 / 100')).toBeInTheDocument();
      });

      const deactBtn = screen.getByRole('button', { name: /deactivate/i });
      fireEvent.click(deactBtn);

      await waitFor(() => {
        expect(couponService.toggleAdminCouponStatus).toHaveBeenCalledWith('cpn-1', expect.any(String));
      });
    });
  });

  describe('AdminPayoutsView', () => {
    it('renders weekly payout batches and generates new batch', async () => {
      vi.mocked(adminPayoutService.listPayoutBatches).mockResolvedValue({
        batches: [
          {
            id: 'batch-1',
            batchNumber: 'PB-2026-W47',
            periodStart: '2026-11-14T00:00:00.000Z',
            periodEnd: '2026-11-21T00:00:00.000Z',
            status: 'draft' as const,
            totalGrossRupees: 10000,
            totalCommissionRupees: 1500,
            totalNetPayoutRupees: 8500,
            totalProviders: 4,
            totalBookings: 8,
            createdAt: '2026-11-21T00:00:00.000Z',
            updatedAt: '2026-11-21T00:00:00.000Z',
          },
        ],
        pagination: { page: 1, limit: 15, total: 1, totalPages: 1 },
      });

      vi.mocked(adminPayoutService.generatePayoutBatch).mockResolvedValue({
        batch: {
          id: 'batch-2',
          batchNumber: 'PB-2026-W48',
          periodStart: '2026-11-21T00:00:00.000Z',
          periodEnd: '2026-11-28T00:00:00.000Z',
          status: 'draft' as const,
          totalGrossRupees: 5000,
          totalCommissionRupees: 750,
          totalNetPayoutRupees: 4250,
          totalProviders: 2,
          totalBookings: 4,
          createdAt: '2026-11-21T00:00:00.000Z',
          updatedAt: '2026-11-21T00:00:00.000Z',
        },
        totalAllocatedRupees: 4250,
        providerCount: 2,
      });

      render(
        <AuthProvider>
          <AdminPayoutsView />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('PB-2026-W47')).toBeInTheDocument();
        expect(screen.getByText('₹8,500')).toBeInTheDocument();
      });

      const genBtn = screen.getByRole('button', { name: /generate weekly payout batch/i });
      fireEvent.click(genBtn);

      await waitFor(() => {
        expect(adminPayoutService.generatePayoutBatch).toHaveBeenCalled();
      });
    });
  });
});

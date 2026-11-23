import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPaymentOrder, verifyPayment } from '../paymentService';
import { fetchProviderEarningsSummary, updateProviderPayoutAccount } from '../providerPayoutService';
import { validateCoupon, toggleAdminCouponStatus } from '../couponService';
import { generatePayoutBatch, issueAdminRefund } from '../adminPayoutService';

describe('Phase 4: Financial Services Unit Tests', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).fetch = mockFetch;
  });

  describe('1. Payment Service (Milestone 4A)', () => {
    it('calls POST /api/payments/create-order and returns order response', async () => {
      const mockOrderRes = {
        success: true,
        data: {
          orderId: 'order_test_123',
          amount: 120000,
          currency: 'INR',
          keyId: 'rzp_test_dummy',
          bookingId: 'bkg-1',
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockOrderRes,
      } as any);

      const res = await createPaymentOrder({ bookingId: 'bkg-1', couponCode: 'SAVE20' }, 'test-token');
      expect(res.orderId).toBe('order_test_123');
      expect(res.amount).toBe(120000);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/payments/create-order'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
          body: JSON.stringify({ bookingId: 'bkg-1', couponCode: 'SAVE20' }),
        })
      );
    });

    it('calls POST /api/payments/verify with HMAC signature and returns payment data', async () => {
      const mockVerifyRes = {
        success: true,
        data: {
          id: 'pay-doc-1',
          razorpayPaymentId: 'pay_test_abc',
          status: 'captured',
          amountRupees: 1200,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockVerifyRes,
      } as any);

      const res = await verifyPayment({
        bookingId: 'bkg-1',
        razorpayOrderId: 'order_test_123',
        razorpayPaymentId: 'pay_test_abc',
        razorpaySignature: 'sig_test_hmac',
      }, 'test-token');

      expect(res.status).toBe('captured');
      expect(res.razorpayPaymentId).toBe('pay_test_abc');
    });
  });

  describe('2. Provider Payout Service (Milestone 4B)', () => {
    it('fetches provider earnings summary from GET /api/provider/earnings/summary', async () => {
      const mockSummary = {
        success: true,
        data: {
          availableBalanceRupees: 4250,
          totalGrossEarningsRupees: 5000,
          totalCommissionDeductedRupees: 750,
          totalNetEarningsRupees: 4250,
          settledAmountRupees: 0,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockSummary,
      } as any);

      const res = await fetchProviderEarningsSummary('prov-token');
      expect(res.availableBalanceRupees).toBe(4250);
      expect(res.totalGrossEarningsRupees).toBe(5000);
    });

    it('updates provider payout bank account', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Updated',
          data: { payoutAccount: { isConfigured: true, maskedAccountNumber: '••••4321' } },
        }),
      } as any);

      const res = await updateProviderPayoutAccount({
        accountType: 'bank_account',
        accountHolderName: 'Karthik Raja',
        accountNumber: '123456784321',
        ifscCode: 'HDFC0001234',
        bankName: 'HDFC Bank',
      }, 'prov-token');

      expect(res.payoutAccount.maskedAccountNumber).toBe('••••4321');
    });
  });

  describe('3. Coupon Service (Milestone 4D)', () => {
    it('validates coupon code via POST /api/coupons/validate', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            valid: true,
            code: 'FESTIVE50',
            discountAmountRupees: 250,
            finalPayableRupees: 750,
          },
        }),
      } as any);

      const res = await validateCoupon({ code: 'FESTIVE50', bookingAmountRupees: 1000 }, 'cust-token');
      expect(res.valid).toBe(true);
      expect(res.discountAmountRupees).toBe(250);
      expect(res.finalPayableRupees).toBe(750);
    });

    it('toggles coupon active status via PATCH /api/admin/coupons/:id/status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'cpn-1', code: 'PROMO10', isActive: false },
        }),
      } as any);

      const res = await toggleAdminCouponStatus('cpn-1', 'admin-token');
      expect(res.isActive).toBe(false);
    });
  });

  describe('4. Admin Payout and Refund Service (Milestones 4B & 4C)', () => {
    it('issues admin manual refund via POST /api/admin/bookings/:id/refund', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            booking: { id: 'bkg-1', paymentStatus: 'refunded' },
            refund: { id: 'rfnd-1', amountRupees: 1200 },
          },
        }),
      } as any);

      const res = await issueAdminRefund('bkg-1', { reason: 'Faulty wiring reported' }, 'admin-token');
      expect(res.refund.amountRupees).toBe(1200);
      expect(res.booking.paymentStatus).toBe('refunded');
    });

    it('generates weekly payout batch via POST /api/admin/payouts/batches/generate', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            batch: { id: 'batch-1', batchNumber: 'PB-2026-W47' },
            totalAllocatedRupees: 8500,
            providerCount: 3,
          },
        }),
      } as any);

      const res = await generatePayoutBatch('admin-token');
      expect(res.batch.batchNumber).toBe('PB-2026-W47');
      expect(res.totalAllocatedRupees).toBe(8500);
      expect(res.providerCount).toBe(3);
    });
  });
});

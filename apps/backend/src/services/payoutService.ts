import mongoose, { Types } from 'mongoose';
import { Booking } from '../models/Booking';
import { ProviderProfile } from '../models/ProviderProfile';
import { ProviderLedger, IProviderLedger } from '../models/ProviderLedger';
import { PayoutBatch, IPayoutBatch, IPayoutBatchItem } from '../models/PayoutBatch';
import { ProviderEarningsSummaryData, PayoutBatchData } from '@dwellio/shared';

export class PayoutService {
  /**
   * Records provider net earnings into ProviderLedger when a job completes and payment is paid.
   * Uses idempotent unique key to prevent duplicate credits.
   */
  async recordJobCompletionEarnings(bookingId: Types.ObjectId | string): Promise<IProviderLedger | null> {
    const bId = new Types.ObjectId(bookingId.toString());
    const booking = await Booking.findById(bId);

    if (!booking) {
      throw new Error(`Booking ${bookingId} not found for earnings recording.`);
    }

    if (booking.status !== 'completed') {
      throw new Error(`Cannot credit provider earnings for booking with status "${booking.status}". Must be completed.`);
    }

    if (booking.paymentStatus !== 'paid') {
      // Unpaid bookings do not credit provider payouts
      return null;
    }

    const idempotencyKey = `earning:booking:${booking._id.toString()}`;

    // Check if earning already recorded
    const existing = await ProviderLedger.findOne({ idempotencyKey });
    if (existing) {
      return existing;
    }

    // Calculations in integer paise
    const grossPaise = Math.round((booking.priceSnapshot || 499) * 100);
    const commissionRate = booking.commissionRateSnapshot ?? 15;
    const commissionPaise = booking.commissionAmountSnapshot
      ? Math.round(booking.commissionAmountSnapshot * 100)
      : Math.round((grossPaise * commissionRate) / 100);

    const netPaise = Math.max(0, grossPaise - commissionPaise);

    // Get previous provider ledger entry to calculate running balance
    const lastEntry = await ProviderLedger.findOne({ providerId: booking.providerId }).sort({ createdAt: -1 });
    const previousBalance = lastEntry ? lastEntry.resultingBalance : 0;
    const newBalance = previousBalance + netPaise;

    const entry = new ProviderLedger({
      providerId: booking.providerId,
      bookingId: booking._id,
      entryType: 'job_earning_credit',
      creditAmount: netPaise,
      debitAmount: 0,
      netAmount: netPaise,
      currency: 'INR',
      resultingBalance: newBalance,
      status: 'available',
      description: `Net earnings credited for completed booking (${booking._id.toString().slice(-8).toUpperCase()})`,
      idempotencyKey,
    });

    await entry.save();

    // Mark booking payout status as eligible
    booking.providerPayoutStatus = 'eligible';
    await booking.save();

    return entry;
  }

  /**
   * Records a debit/reversal against provider ledger (e.g. for dispute financial clawback).
   */
  async recordProviderDebitAdjustment(params: {
    providerId: Types.ObjectId | string;
    bookingId?: Types.ObjectId | string;
    disputeId?: Types.ObjectId | string;
    debitAmountPaise: number;
    reason: string;
    entryType: 'refund_reversal_debit' | 'dispute_adjustment_debit' | 'manual_adjustment';
  }): Promise<IProviderLedger> {
    const { providerId, bookingId, disputeId, debitAmountPaise, reason, entryType } = params;
    const pId = new Types.ObjectId(providerId.toString());

    const idempotencyKey = disputeId
      ? `debit:${entryType}:${disputeId.toString()}:${debitAmountPaise}`
      : `debit:${entryType}:${bookingId ? bookingId.toString() : Date.now()}:${debitAmountPaise}`;

    // Return existing ledger entry if already recorded idempotently
    const existingEntry = await ProviderLedger.findOne({ idempotencyKey });
    if (existingEntry) {
      return existingEntry;
    }

    const lastEntry = await ProviderLedger.findOne({ providerId: pId }).sort({ createdAt: -1 });
    const previousBalance = lastEntry ? lastEntry.resultingBalance : 0;
    const newBalance = previousBalance - debitAmountPaise;

    const entry = new ProviderLedger({
      providerId: pId,
      bookingId: bookingId ? new Types.ObjectId(bookingId.toString()) : undefined,
      entryType,
      creditAmount: 0,
      debitAmount: debitAmountPaise,
      netAmount: -debitAmountPaise,
      currency: 'INR',
      resultingBalance: newBalance,
      status: 'available',
      description: reason,
      idempotencyKey,
    });

    try {
      await entry.save();
    } catch (saveErr: any) {
      if (saveErr.code === 11000 || (saveErr.message && saveErr.message.includes('E11000'))) {
        const raceEntry = await ProviderLedger.findOne({ idempotencyKey });
        if (raceEntry) return raceEntry;
      }
      throw saveErr;
    }
    return entry;
  }

  /**
   * Generates summary KPIs for provider earnings dashboard.
   */
  async getProviderEarningsSummary(providerProfileId: Types.ObjectId | string): Promise<ProviderEarningsSummaryData> {
    const pId = new Types.ObjectId(providerProfileId.toString());
    const profile = await ProviderProfile.findById(pId).select('+payoutAccount.accountNumber +payoutAccount.upiId');

    const [ledgerAgg, completedBookings] = await Promise.all([
      ProviderLedger.aggregate([
        { $match: { providerId: pId } },
        {
          $group: {
            _id: null,
            totalCredits: { $sum: '$creditAmount' },
            totalDebits: { $sum: '$debitAmount' },
            availableBalance: {
              $sum: {
                $cond: [{ $eq: ['$status', 'available'] }, '$netAmount', 0],
              },
            },
            settledAmount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'settled'] }, '$creditAmount', 0],
              },
            },
          },
        },
      ]),
      Booking.find({
        providerId: pId,
        status: 'completed',
      }),
    ]);

    let totalGrossPaise = 0;
    let totalCommissionPaise = 0;
    for (const b of completedBookings) {
      const gross = Math.round((b.priceSnapshot || 499) * 100);
      const comm = b.commissionAmountSnapshot
        ? Math.round(b.commissionAmountSnapshot * 100)
        : Math.round(gross * ((b.commissionRateSnapshot ?? 15) / 100));
      totalGrossPaise += gross;
      totalCommissionPaise += comm;
    }

    const availablePaise = Math.max(0, ledgerAgg[0]?.availableBalance || 0);
    const settledPaise = Math.max(0, ledgerAgg[0]?.settledAmount || 0);
    const totalNetPaise = Math.max(0, (ledgerAgg[0]?.totalCredits || 0) - (ledgerAgg[0]?.totalDebits || 0));

    return {
      totalGrossEarningsRupees: Math.round(totalGrossPaise / 100),
      totalCommissionDeductedRupees: Math.round(totalCommissionPaise / 100),
      totalNetEarningsRupees: Math.round(totalNetPaise / 100),
      pendingPayoutBalanceRupees: Math.round(availablePaise / 100),
      settledPayoutAmountRupees: Math.round(settledPaise / 100),
      completedJobsCount: completedBookings.length,
      payoutMethod: profile?.payoutMethod || 'none',
      payoutAccountMasked: profile?.payoutAccount
        ? {
            accountNumberMasked: profile.payoutAccount.accountNumberMasked,
            ifsc: profile.payoutAccount.ifsc,
            beneficiaryName: profile.payoutAccount.beneficiaryName,
            bankName: profile.payoutAccount.bankName,
            upiIdMasked: profile.payoutAccount.upiIdMasked,
          }
        : undefined,
      kycStatus: profile?.kycStatus || 'pending',
    };
  }

  /**
   * Generates a weekly payout batch for all providers with positive available ledger balances.
   */
  async generateWeeklyPayoutBatch(
    periodStart: Date,
    periodEnd: Date,
    adminUserId?: Types.ObjectId | string
  ): Promise<IPayoutBatch> {
    // Find all unallocated available ledger entries
    const availableEntries = await ProviderLedger.find({
      status: 'available',
      createdAt: { $gte: periodStart, $lte: periodEnd },
    }).populate('providerId', 'displayName phone');

    // Group by provider
    const providerMap = new Map<
      string,
      {
        providerId: Types.ObjectId;
        displayName: string;
        phone?: string;
        eligibleAmountPaise: number;
        bookingIds: Types.ObjectId[];
        ledgerEntryIds: Types.ObjectId[];
      }
    >();

    for (const entry of availableEntries) {
      const pidStr = entry.providerId._id.toString();
      const existing = providerMap.get(pidStr) || {
        providerId: (entry.providerId as any)._id || entry.providerId,
        displayName: (entry.providerId as any).displayName || 'Service Provider',
        phone: (entry.providerId as any).phone,
        eligibleAmountPaise: 0,
        bookingIds: [] as Types.ObjectId[],
        ledgerEntryIds: [] as Types.ObjectId[],
      };

      existing.eligibleAmountPaise += entry.netAmount;
      existing.ledgerEntryIds.push(entry._id as Types.ObjectId);
      if (entry.bookingId) {
        existing.bookingIds.push(entry.bookingId as Types.ObjectId);
      }

      providerMap.set(pidStr, existing);
    }

    const items: IPayoutBatchItem[] = [];
    let totalBatchPaise = 0;

    for (const item of providerMap.values()) {
      if (item.eligibleAmountPaise > 0) {
        items.push({
          providerId: item.providerId,
          providerDisplayName: item.displayName,
          providerPhone: item.phone,
          eligibleAmount: item.eligibleAmountPaise,
          bookingIds: item.bookingIds,
          ledgerEntryIds: item.ledgerEntryIds,
          settlementStatus: 'pending',
        });
        totalBatchPaise += item.eligibleAmountPaise;
      }
    }

    const weekNum = Math.ceil(
      ((periodStart.getTime() - new Date(periodStart.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7
    );
    const batchNumber = `BATCH-${periodStart.getFullYear()}-W${String(weekNum).padStart(2, '0')}-${Date.now()
      .toString()
      .slice(-4)}`;

    const batch = new PayoutBatch({
      batchNumber,
      periodStart,
      periodEnd,
      totalAmount: totalBatchPaise,
      totalProvidersCount: items.length,
      status: 'draft',
      items,
      generatedByAdminId: adminUserId ? new Types.ObjectId(adminUserId.toString()) : undefined,
    });

    await batch.save();

    // Mark included ledger entries as allocated to this batch
    const allLedgerIds = items.flatMap((it) => it.ledgerEntryIds);
    if (allLedgerIds.length > 0) {
      await ProviderLedger.updateMany(
        { _id: { $in: allLedgerIds } },
        { $set: { status: 'allocated', payoutBatchId: batch._id } }
      );
    }

    return batch;
  }

  /**
   * Approves a payout batch for settlement.
   */
  async approvePayoutBatch(batchId: Types.ObjectId | string, adminUserId: Types.ObjectId | string): Promise<IPayoutBatch> {
    const bId = new Types.ObjectId(batchId.toString());
    const batch = await PayoutBatch.findById(bId);
    if (!batch) {
      throw new Error(`Payout batch ${batchId} not found.`);
    }

    if (batch.status !== 'draft') {
      throw new Error(`Only draft payout batches can be approved. Current status: "${batch.status}".`);
    }

    batch.status = 'approved';
    batch.approvedByAdminId = new Types.ObjectId(adminUserId.toString());
    await batch.save();

    return batch;
  }

  /**
   * Records manual or gateway settlement for an approved payout batch.
   */
  async recordBatchSettlement(
    batchId: Types.ObjectId | string,
    settlementReference: string,
    adminUserId: Types.ObjectId | string
  ): Promise<IPayoutBatch> {
    const bId = new Types.ObjectId(batchId.toString());
    const batch = await PayoutBatch.findById(bId);
    if (!batch) {
      throw new Error(`Payout batch ${batchId} not found.`);
    }

    if (batch.status !== 'approved') {
      throw new Error(`Only approved batches can be settled. Current status: "${batch.status}".`);
    }

    batch.status = 'settled';
    batch.settledAt = new Date();
    for (const item of batch.items) {
      item.settlementStatus = 'settled';
      item.settlementReference = settlementReference;
      item.settledAt = new Date();
    }

    await batch.save();

    // Mark all included ledger entries as settled
    const allLedgerIds = batch.items.flatMap((it) => it.ledgerEntryIds);
    if (allLedgerIds.length > 0) {
      await ProviderLedger.updateMany(
        { _id: { $in: allLedgerIds } },
        { $set: { status: 'settled' } }
      );
    }

    // Mark all included bookings as settled
    const allBookingIds = batch.items.flatMap((it) => it.bookingIds);
    if (allBookingIds.length > 0) {
      await Booking.updateMany(
        { _id: { $in: allBookingIds } },
        { $set: { providerPayoutStatus: 'settled' } }
      );
    }

    return batch;
  }
}

export const payoutService = new PayoutService();

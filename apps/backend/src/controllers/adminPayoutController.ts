import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { PayoutBatch } from '../models/PayoutBatch';
import { ProviderProfile } from '../models/ProviderProfile';
import { AuditLog } from '../models/AuditLog';
import { payoutService } from '../services/payoutService';
import { sendInAppNotification } from '../utils/notification';
import { sendInternalError } from '../utils/security';
import {
  ApiResponse,
  PaginationMeta,
  PayoutBatchData,
} from '@dwellio/shared';

/**
 * Admin: List Payout Batches
 * GET /api/admin/payouts/batches
 */
export const listPayoutBatches = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const status = req.query.status as string | undefined;

    const filter: any = {};
    if (status) {
      filter.status = status;
    }

    const total = await PayoutBatch.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const rawBatches = await PayoutBatch.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const batches: PayoutBatchData[] = rawBatches.map((b) => ({
      id: b._id.toString(),
      batchNumber: b.batchNumber,
      periodStart: b.periodStart.toISOString(),
      periodEnd: b.periodEnd.toISOString(),
      totalAmountRupees: Math.round(b.totalAmount / 100),
      totalAmountPaise: b.totalAmount,
      totalProvidersCount: b.totalProvidersCount,
      status: b.status,
      items: b.items.map((it) => ({
        providerId: it.providerId.toString(),
        providerDisplayName: it.providerDisplayName,
        providerPhone: it.providerPhone,
        eligibleAmountRupees: Math.round(it.eligibleAmount / 100),
        eligibleAmountPaise: it.eligibleAmount,
        bookingIds: it.bookingIds.map((id) => id.toString()),
        settlementStatus: it.settlementStatus,
        settlementReference: it.settlementReference,
        settledAt: it.settledAt ? it.settledAt.toISOString() : undefined,
      })),
      generatedByAdminId: b.generatedByAdminId?.toString(),
      approvedByAdminId: b.approvedByAdminId?.toString(),
      settledAt: b.settledAt ? b.settledAt.toISOString() : undefined,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    }));

    const pagination: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
    };

    res.status(200).json({
      success: true,
      message: 'Payout batches retrieved successfully.',
      data: {
        batches,
        pagination,
      },
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminPayout.listPayoutBatches', error, 'Failed to list payout batches.');
  }
};

/**
 * Admin: Generate a Weekly Payout Batch
 * POST /api/admin/payouts/batches/generate
 */
export const generatePayoutBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { periodStart, periodEnd } = req.body || {};

    const now = new Date();
    // Default to past 7 days if omitted
    const start = periodStart ? new Date(periodStart) : new Date(now.getTime() - 7 * 86400000);
    const end = periodEnd ? new Date(periodEnd) : now;

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      res.status(400).json({
        success: false,
        message: 'Invalid period date range. Expected periodStart to precede periodEnd.',
      });
      return;
    }

    const batch = await payoutService.generateWeeklyPayoutBatch(start, end, req.user?._id);

    if (req.user) {
      await new AuditLog({
        adminId: req.user._id,
        action: 'PAYOUT_BATCH_CREATED',
        targetId: batch._id,
        targetType: 'PayoutBatch',
        details: {
          batchNumber: batch.batchNumber,
          totalAmountPaise: batch.totalAmount,
          totalProviders: batch.totalProvidersCount,
          periodStart: start,
          periodEnd: end,
        },
      }).save().catch(() => {});
    }

    res.status(201).json({
      success: true,
      message: `Weekly payout batch ${batch.batchNumber} generated with ${batch.totalProvidersCount} eligible providers.`,
      data: {
        id: batch._id.toString(),
        batchNumber: batch.batchNumber,
        totalAmountRupees: Math.round(batch.totalAmount / 100),
        totalProvidersCount: batch.totalProvidersCount,
        status: batch.status,
      },
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminPayout.generatePayoutBatch', error, 'Failed to generate payout batch.');
  }
};

/**
 * Admin: Approve Payout Batch
 * PATCH /api/admin/payouts/batches/:id/approve
 */
export const approvePayoutBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid payout batch ID.' });
      return;
    }

    const batch = await payoutService.approvePayoutBatch(id, req.user!._id);

    if (req.user) {
      await new AuditLog({
        adminId: req.user._id,
        action: 'PAYOUT_APPROVED',
        targetId: batch._id,
        targetType: 'PayoutBatch',
        details: {
          batchNumber: batch.batchNumber,
          totalAmountPaise: batch.totalAmount,
        },
      }).save().catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: `Payout batch ${batch.batchNumber} has been approved for settlement.`,
      data: {
        id: batch._id.toString(),
        batchNumber: batch.batchNumber,
        status: batch.status,
      },
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminPayout.approvePayoutBatch', error, 'Failed to approve payout batch.');
  }
};

/**
 * Admin: Record Settlement for Payout Batch
 * PATCH /api/admin/payouts/batches/:id/settle
 */
export const settlePayoutBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { settlementReference } = req.body || {};

    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid payout batch ID.' });
      return;
    }

    if (!settlementReference || typeof settlementReference !== 'string' || settlementReference.trim().length < 3) {
      res.status(400).json({
        success: false,
        message: 'A valid settlement reference (e.g. Bank UTR / Transfer ID) is required.',
      });
      return;
    }

    const batch = await payoutService.recordBatchSettlement(id, settlementReference.trim(), req.user!._id);

    if (req.user) {
      await new AuditLog({
        adminId: req.user._id,
        action: 'PAYOUT_SETTLEMENT_RECORDED',
        targetId: batch._id,
        targetType: 'PayoutBatch',
        details: {
          batchNumber: batch.batchNumber,
          settlementReference: settlementReference.trim(),
          totalAmountPaise: batch.totalAmount,
        },
      }).save().catch(() => {});
    }

    // Notify all providers in batch
    for (const item of batch.items) {
      const providerProfile = await ProviderProfile.findById(item.providerId);
      if (providerProfile) {
        await sendInAppNotification({
          recipientId: providerProfile.userId,
          type: 'PAYOUT_SETTLED',
          title: 'Payout Settled to Bank Account',
          message: `Payout of ₹${Math.round(item.eligibleAmount / 100)} has been settled (Ref: ${settlementReference.trim()}).`,
          dedupKey: `payout:${batch._id}:${item.providerId}:settled`,
        }).catch(() => {});
      }
    }

    res.status(200).json({
      success: true,
      message: `Payout batch ${batch.batchNumber} settled successfully.`,
      data: {
        id: batch._id.toString(),
        batchNumber: batch.batchNumber,
        status: batch.status,
        settledAt: batch.settledAt,
      },
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminPayout.settlePayoutBatch', error, 'Failed to settle payout batch.');
  }
};

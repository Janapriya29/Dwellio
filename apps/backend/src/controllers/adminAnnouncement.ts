import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  ApiResponse,
  PaginationMeta,
  AnnouncementData,
  AnnouncementAudience,
} from '@dwellio/shared';
import { Announcement } from '../models/Announcement';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { sendInAppNotification } from '../utils/notification';
import { sendInternalError } from '../utils/security';
import { queueService } from '../services/queueService';

const formatAnnouncementDto = (a: any): AnnouncementData => {
  const adminDoc = a.createdByAdminId;
  return {
    id: a._id.toString(),
    title: a.title,
    message: a.message,
    audience: a.audience,
    createdByAdminId: (adminDoc?._id || adminDoc || '').toString(),
    createdByName: adminDoc?.name || 'Administrator',
    recipientCount: a.recipientCount || 0,
    deliveredCount: a.deliveredCount ?? 0,
    failedCount: a.failedCount ?? 0,
    deliveryStatus: a.deliveryStatus || 'pending',
    expiresAt: a.expiresAt
      ? a.expiresAt instanceof Date
        ? a.expiresAt.toISOString()
        : new Date(a.expiresAt).toISOString()
      : undefined,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : new Date(a.createdAt).toISOString(),
  };
};

/**
 * Processes announcement delivery in bounded, cooperative batches.
 * Idempotently skips already delivered user IDs ($nin: deliveredUserIds) and persists
 * progress after each batch.
 */
export const deliverAnnouncementBatched = async (
  announcementId: mongoose.Types.ObjectId | string,
  batchSize: number = 50
): Promise<void> => {
  const announcement = await Announcement.findById(announcementId);
  if (!announcement) return;

  announcement.deliveryStatus = 'processing';
  await announcement.save();

  try {
    // 1. Build recipient filter for active users in the targeted audience
    const userFilter: Record<string, unknown> = {
      isActive: true,
    };

    if (announcement.audience === 'customers') {
      userFilter.role = 'customer';
    } else if (announcement.audience === 'providers') {
      userFilter.role = 'provider';
    }

    // Exclude users who have already received this announcement
    if (announcement.deliveredUserIds && announcement.deliveredUserIds.length > 0) {
      userFilter._id = { $nin: announcement.deliveredUserIds };
    }

    const pendingRecipients = await User.find(userFilter).select('_id');

    // Process recipients in bounded batches of batchSize
    for (let i = 0; i < pendingRecipients.length; i += batchSize) {
      const batch = pendingRecipients.slice(i, i + batchSize);

      const sendPromises = batch.map((u) =>
        sendInAppNotification({
          recipientId: u._id,
          type: 'SYSTEM_ANNOUNCEMENT',
          title: `Announcement: ${announcement.title}`,
          message: announcement.message,
          dedupKey: `announcement:${announcement._id}:${u._id}`,
        })
      );

      const results = await Promise.allSettled(sendPromises);

      const successfulIds: mongoose.Types.ObjectId[] = [];
      let batchFailedCount = 0;

      results.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          successfulIds.push(batch[idx]._id);
        } else {
          batchFailedCount += 1;
        }
      });

      // Persist delivery progress to DB after each batch
      if (successfulIds.length > 0 || batchFailedCount > 0) {
        await Announcement.findByIdAndUpdate(announcement._id, {
          $addToSet: { deliveredUserIds: { $each: successfulIds } },
          $inc: {
            deliveredCount: successfulIds.length,
            failedCount: batchFailedCount,
          },
        });
      }

      // Micro-yield to event loop between batches so server remains responsive
      if (i + batchSize < pendingRecipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }

    // Re-check overall delivery status and synchronize deliveredCount with unique deliveredUserIds
    const refreshed = await Announcement.findById(announcement._id);
    if (refreshed) {
      refreshed.deliveredCount = refreshed.deliveredUserIds ? refreshed.deliveredUserIds.length : 0;
      refreshed.deliveryStatus =
        refreshed.failedCount > 0 ? 'partially_failed' : 'delivered';
      await refreshed.save();
    }
  } catch (err: any) {
    await Announcement.findByIdAndUpdate(announcement._id, {
      deliveryStatus: 'partially_failed',
      lastDeliveryError: err.message || 'Unknown delivery failure',
    });
  }
};

/**
 * Create & Broadcast System Announcement (Admin)
 * POST /api/admin/announcements
 */
export const createAnnouncement = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, message, audience, expiresAt } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 120) {
      res.status(400).json({
        success: false,
        message: 'Announcement title must be between 3 and 120 characters.',
      });
      return;
    }

    if (!message || typeof message !== 'string' || message.trim().length < 5 || message.trim().length > 1000) {
      res.status(400).json({
        success: false,
        message: 'Announcement message must be between 5 and 1000 characters.',
      });
      return;
    }

    const ALLOWED_AUDIENCES: AnnouncementAudience[] = ['all', 'customers', 'providers'];
    if (!audience || !ALLOWED_AUDIENCES.includes(audience)) {
      res.status(400).json({
        success: false,
        message: 'Audience must be "all", "customers", or "providers".',
      });
      return;
    }

    let parsedExpiry: Date | undefined;
    if (expiresAt) {
      const exp = new Date(expiresAt);
      if (isNaN(exp.getTime())) {
        res.status(400).json({ success: false, message: 'Invalid expiresAt date format.' });
        return;
      }
      parsedExpiry = exp;
    }

    // Determine target recipients count
    const userFilter: Record<string, unknown> = { isActive: true };
    if (audience === 'customers') {
      userFilter.role = 'customer';
    } else if (audience === 'providers') {
      userFilter.role = 'provider';
    }

    const targetUsers = await User.find(userFilter).select('_id');
    const recipientCount = targetUsers.length;

    const announcement = new Announcement({
      title: title.trim(),
      message: message.trim(),
      audience,
      createdByAdminId: req.user!._id,
      recipientCount,
      deliveredCount: 0,
      failedCount: 0,
      deliveryStatus: 'pending',
      deliveredUserIds: [],
      expiresAt: parsedExpiry,
    });

    await announcement.save();

    // Record immutable audit log
    if (req.user) {
      await new AuditLog({
        adminId: req.user._id,
        action: 'ANNOUNCEMENT_BROADCAST',
        targetId: announcement._id,
        targetType: 'Announcement',
        details: {
          announcementId: announcement._id,
          title: announcement.title,
          audience,
          recipientCount,
        },
      }).save().catch(() => {});
    }

    // Launch durable BullMQ batched delivery
    if (recipientCount === 0) {
      announcement.deliveryStatus = 'delivered';
      await announcement.save();
    } else {
      announcement.deliveryStatus = 'processing';
      await announcement.save();

      const BATCH_SIZE = 50;
      for (let i = 0; i < targetUsers.length; i += BATCH_SIZE) {
        const batch = targetUsers.slice(i, i + BATCH_SIZE);
        await queueService.enqueueAnnouncementBatch({
          announcementId: announcement._id.toString(),
          recipientUserIds: batch.map((u) => u._id.toString()),
          title: announcement.title,
          message: announcement.message,
          batchIndex: Math.floor(i / BATCH_SIZE),
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Announcement broadcast successfully to ${recipientCount} active recipients.`,
      data: formatAnnouncementDto(announcement),
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminAnnouncement.createAnnouncement', error, 'Failed to create announcement.');
  }
};

/**
 * Retry Incomplete Announcement Delivery (Admin)
 * POST /api/admin/announcements/:id/retry
 */
export const retryAnnouncementDelivery = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid announcement ID format.' });
      return;
    }

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      res.status(404).json({ success: false, message: 'Announcement not found.' });
      return;
    }

    if (announcement.deliveryStatus === 'delivered') {
      res.status(400).json({
        success: false,
        message: 'Announcement has already been fully delivered.',
      });
      return;
    }

    if (announcement.deliveryStatus === 'processing') {
      res.status(409).json({
        success: false,
        message: 'Announcement delivery is currently processing.',
      });
      return;
    }

    // Determine remaining undelivered recipients
    const userFilter: Record<string, unknown> = { isActive: true };
    if (announcement.audience === 'customers') {
      userFilter.role = 'customer';
    } else if (announcement.audience === 'providers') {
      userFilter.role = 'provider';
    }
    if (announcement.deliveredUserIds && announcement.deliveredUserIds.length > 0) {
      userFilter._id = { $nin: announcement.deliveredUserIds };
    }

    const pendingRecipients = await User.find(userFilter).select('_id');

    if (pendingRecipients.length === 0) {
      announcement.deliveryStatus = 'delivered';
      announcement.failedCount = 0;
      await announcement.save();
      res.status(200).json({
        success: true,
        message: 'All recipients have already received this announcement.',
        data: formatAnnouncementDto(announcement),
      });
      return;
    }

    // Reset failed count and re-trigger delivery via BullMQ
    announcement.deliveryStatus = 'processing';
    announcement.failedCount = 0;
    await announcement.save();

    const BATCH_SIZE = 50;
    for (let i = 0; i < pendingRecipients.length; i += BATCH_SIZE) {
      const batch = pendingRecipients.slice(i, i + BATCH_SIZE);
      await queueService.enqueueAnnouncementBatch({
        announcementId: announcement._id.toString(),
        recipientUserIds: batch.map((u) => u._id.toString()),
        title: announcement.title,
        message: announcement.message,
        batchIndex: Math.floor(i / BATCH_SIZE),
      });
    }

    res.status(200).json({
      success: true,
      message: 'Announcement delivery retry initiated successfully.',
      data: formatAnnouncementDto(announcement),
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminAnnouncement.retryAnnouncementDelivery', error, 'Failed to retry announcement delivery.');
  }
};

/**
 * List Broadcast Announcements (Admin)
 * GET /api/admin/announcements
 */
export const listAdminAnnouncements = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const { audience } = req.query;

    const filter: Record<string, unknown> = {};
    if (audience && audience !== 'all') {
      filter.audience = audience;
    }

    const total = await Announcement.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const rawList = await Announcement.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdByAdminId', 'name email');

    const announcements: AnnouncementData[] = rawList.map(formatAnnouncementDto);

    const pagination: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
    };

    res.status(200).json({
      success: true,
      message: 'Announcements retrieved successfully.',
      data: {
        announcements,
        pagination,
      },
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminAnnouncement.listAdminAnnouncements', error, 'Failed to retrieve announcements.');
  }
};

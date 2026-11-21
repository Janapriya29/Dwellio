import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  ApiResponse,
  PaginationMeta,
  AdminProviderDetail,
  ProviderVerificationStatus,
} from '@dwellio/shared';
import { ProviderProfile } from '../models/ProviderProfile';
import { User } from '../models/User';
import { Booking } from '../models/Booking';
import { AuditLog } from '../models/AuditLog';
import { toProviderProfileData } from '../utils/provider';
import { sendInAppNotification } from '../utils/notification';
import { sendInternalError } from '../utils/security';

/**
 * List Providers for Admin Oversight (Milestone 3C)
 * Supports keyword search (q), status filtering, and pagination
 * GET /api/admin/providers
 */
export const listAdminProviders = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const { q, status } = req.query;

    const filter: Record<string, unknown> = {};

    if (status && status !== 'all') {
      if (!['pending', 'approved', 'rejected', 'suspended'].includes(status as string)) {
        res.status(400).json({
          success: false,
          message: 'Invalid status filter. Must be "pending", "approved", "rejected", "suspended", or "all".',
        });
        return;
      }
      filter.verificationStatus = status;
    }

    if (q && typeof q === 'string' && q.trim().length > 0) {
      const sanitized = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { displayName: { $regex: sanitized, $options: 'i' } },
        { phone: { $regex: sanitized, $options: 'i' } },
        { serviceArea: { $regex: sanitized, $options: 'i' } },
        { skills: { $regex: sanitized, $options: 'i' } },
      ];
    }

    const total = await ProviderProfile.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const rawProfiles = await ProviderProfile.find(filter)
      .populate('userId', 'name email createdAt role isActive')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const providers = rawProfiles.map((profile) => {
      const userDoc: any = profile.userId;
      return {
        ...toProviderProfileData(profile),
        user: userDoc && userDoc._id
          ? {
              id: userDoc._id.toString(),
              name: userDoc.name,
              email: userDoc.email,
              role: userDoc.role,
              isActive: userDoc.isActive,
            }
          : undefined,
      };
    });

    const pagination: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
    };

    res.status(200).json({
      success: true,
      message: 'Providers retrieved successfully.',
      data: {
        providers,
        pagination,
      },
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminProvider.listAdminProviders', error, 'Failed to list providers.');
  }
};

/**
 * Get Comprehensive Provider Detail (Admin)
 * GET /api/admin/providers/:id
 */
export const getAdminProviderDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid provider ID format.' });
      return;
    }

    const profile = await ProviderProfile.findById(id).populate('userId', 'name email createdAt role isActive');
    if (!profile) {
      res.status(404).json({ success: false, message: 'Provider profile not found.' });
      return;
    }

    // Aggregate booking performance metrics
    const [bookingStats] = await Booking.aggregate([
      { $match: { providerId: profile._id } },
      {
        $group: {
          _id: null,
          completedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          cancelledCount: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
          },
          totalEarnings: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                { $ifNull: ['$priceSnapshot', 499] },
                0,
              ],
            },
          },
        },
      },
    ]);

    const userDoc: any = profile.userId;
    const providerDetail: AdminProviderDetail = {
      id: profile._id.toString(),
      userId: userDoc?._id ? userDoc._id.toString() : profile.userId.toString(),
      displayName: profile.displayName,
      phone: profile.phone,
      serviceArea: profile.serviceArea,
      skills: profile.skills || [],
      bio: profile.bio,
      yearsOfExperience: profile.experienceYears,
      profilePictureUrl: profile.avatarUrl,
      verificationStatus: profile.verificationStatus,
      rejectionReason: profile.rejectionReason,
      suspensionReason: profile.suspensionReason,
      reviewedAt: profile.reviewedAt ? profile.reviewedAt.toISOString() : undefined,
      workingSchedule: profile.workingSchedule || [],
      blockedDates: profile.blockedDates || [],
      isAcceptingJobs: profile.isAcceptingJobs ?? true,
      ratingAverage: profile.ratingAverage ?? 0,
      reviewCount: profile.reviewCount ?? 0,
      completedJobCount: bookingStats?.completedCount || 0,
      cancelledJobCount: bookingStats?.cancelledCount || 0,
      totalRecordedEarnings: Math.round(bookingStats?.totalEarnings || 0),
      user: userDoc?._id
        ? {
            id: userDoc._id.toString(),
            name: userDoc.name,
            email: userDoc.email,
            isActive: userDoc.isActive ?? true,
          }
        : undefined,
      createdAt: profile.createdAt ? profile.createdAt.toISOString() : new Date().toISOString(),
    };

    res.status(200).json({
      success: true,
      message: 'Provider details retrieved successfully.',
      data: providerDetail,
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminProvider.getAdminProviderDetail', error, 'Failed to retrieve provider details.');
  }
};

/**
 * Suspend or Reactivate Provider Profile (Admin)
 * PATCH /api/admin/providers/:id/status
 */
export const updateProviderStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { status, reason } = req.body;

    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid provider ID format.' });
      return;
    }

    if (!['approved', 'suspended'].includes(status)) {
      res.status(400).json({
        success: false,
        message: 'Status must be either "approved" or "suspended".',
      });
      return;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500) {
      res.status(400).json({
        success: false,
        message: 'A status change reason between 5 and 500 characters is required.',
      });
      return;
    }

    const profile = await ProviderProfile.findById(id);
    if (!profile) {
      res.status(404).json({ success: false, message: 'Provider profile not found.' });
      return;
    }

    const previousStatus = profile.verificationStatus;
    const targetUser = await User.findById(profile.userId);

    if (status === 'suspended') {
      // If not already suspended, track whether the User account was active before suspension
      if (previousStatus !== 'suspended') {
        if (targetUser && targetUser.isActive) {
          profile.userDeactivatedBySuspension = true;
          targetUser.isActive = false;
          await targetUser.save();
        } else {
          // Account was already disabled independently of this suspension
          profile.userDeactivatedBySuspension = false;
        }
      }

      profile.verificationStatus = 'suspended';
      profile.suspensionReason = reason.trim();
      profile.suspendedAt = new Date();
      await profile.save();

      if (req.user) {
        await new AuditLog({
          adminId: req.user._id,
          action: 'PROVIDER_STATUS_CHANGED',
          targetId: profile._id,
          targetType: 'ProviderProfile',
          details: {
            providerId: profile._id,
            userId: profile.userId,
            previousStatus,
            newStatus: 'suspended',
            reason: reason.trim(),
            userDeactivatedBySuspension: profile.userDeactivatedBySuspension,
          },
        }).save().catch(() => {});
      }

      await sendInAppNotification({
        recipientId: profile.userId,
        type: 'ACCOUNT_SUSPENDED',
        title: 'Provider Account Suspended',
        message: `Your service provider account has been suspended: "${reason.trim().slice(0, 150)}". Please contact administration.`,
        dedupKey: `provider:${profile._id}:suspended:${Date.now()}`,
      }).catch(() => {});
    } else {
      // Reactivate to 'approved'
      // Only restore User.isActive if the user was deactivated specifically by this provider suspension
      if (previousStatus === 'suspended') {
        if (profile.userDeactivatedBySuspension === true && targetUser && !targetUser.isActive) {
          targetUser.isActive = true;
          targetUser.role = 'provider';
          await targetUser.save();
        }
        profile.userDeactivatedBySuspension = false;
        profile.suspensionReason = undefined;
        profile.suspendedAt = undefined;
      }

      profile.verificationStatus = 'approved';
      await profile.save();

      if (req.user) {
        await new AuditLog({
          adminId: req.user._id,
          action: 'PROVIDER_STATUS_CHANGED',
          targetId: profile._id,
          targetType: 'ProviderProfile',
          details: {
            providerId: profile._id,
            userId: profile.userId,
            previousStatus,
            newStatus: 'approved',
            reason: reason.trim(),
            userReactivated: profile.userDeactivatedBySuspension === true,
          },
        }).save().catch(() => {});
      }

      await sendInAppNotification({
        recipientId: profile.userId,
        type: 'APPLICATION_APPROVED',
        title: 'Provider Account Restored',
        message: 'Your service provider account has been reactivated. You can now accept customer appointments.',
        dedupKey: `provider:${profile._id}:restored:${Date.now()}`,
      }).catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: `Provider status updated to ${status} successfully.`,
      data: {
        id: profile._id.toString(),
        displayName: profile.displayName,
        verificationStatus: profile.verificationStatus,
      },
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminProvider.updateProviderStatus', error, 'Failed to update provider status.');
  }
};

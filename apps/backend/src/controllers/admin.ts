import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ApiResponse, PaginationMeta } from '@dwellio/shared';
import { ProviderProfile, IProviderProfile } from '../models/ProviderProfile';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { toProviderProfileData } from '../utils/provider';
import { sendInAppNotification } from '../utils/notification';

/**
 * List Provider Applications (Admin)
 * GET /api/admin/providers/applications
 */
export const listApplications = async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
  const status = req.query.status as string;

  const filter: Record<string, unknown> = {};
  if (status) {
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid status filter. Must be "pending", "approved", or "rejected".',
      };
      res.status(400).json(response);
      return;
    }
    filter.verificationStatus = status;
  }

  const total = await ProviderProfile.countDocuments(filter);
  const totalPages = Math.ceil(total / limit) || 1;

  const rawApplications = await ProviderProfile.find(filter)
    .populate('userId', 'name email createdAt role isActive')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  const applications = rawApplications.map((profile) => {
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

  const response: ApiResponse<{ applications: typeof applications; pagination: PaginationMeta }> = {
    success: true,
    message: 'Provider applications retrieved successfully.',
    data: {
      applications,
      pagination,
    },
  };

  res.status(200).json(response);
};

/**
 * Retrieve Single Provider Application Details (Admin)
 * GET /api/admin/providers/applications/:id
 */
export const getApplicationById = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;

  if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
    const response: ApiResponse = {
      success: false,
      message: 'Invalid application ID format.',
    };
    res.status(400).json(response);
    return;
  }

  const profile = await ProviderProfile.findById(id).populate('userId', 'name email createdAt role isActive');

  if (!profile) {
    const response: ApiResponse = {
      success: false,
      message: 'Provider application not found.',
    };
    res.status(404).json(response);
    return;
  }

  const userDoc: any = profile.userId;
  const applicationData = {
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

  const response: ApiResponse<{ application: typeof applicationData }> = {
    success: true,
    message: 'Provider application details retrieved successfully.',
    data: {
      application: applicationData,
    },
  };

  res.status(200).json(response);
};

/**
 * Approve Provider Application (Admin)
 * PATCH /api/admin/providers/applications/:id/approve
 */
export const approveApplication = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;

  if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
    const response: ApiResponse = {
      success: false,
      message: 'Invalid application ID format.',
    };
    res.status(400).json(response);
    return;
  }

  const profile = await ProviderProfile.findById(id);

  if (!profile) {
    const response: ApiResponse = {
      success: false,
      message: 'Provider application not found.',
    };
    res.status(404).json(response);
    return;
  }

  if (profile.verificationStatus === 'approved') {
    const response: ApiResponse = {
      success: false,
      message: 'Provider application has already been approved.',
    };
    res.status(400).json(response);
    return;
  }

  const previousStatus = profile.verificationStatus;

  // 1. Update ProviderProfile
  profile.verificationStatus = 'approved';
  profile.rejectionReason = undefined;
  profile.reviewedBy = req.user!._id;
  profile.reviewedAt = new Date();
  await profile.save();

  // 2. Elevate user's role to 'provider'
  await User.findByIdAndUpdate(profile.userId, { role: 'provider' });

  // 3. Record Audit Log
  await new AuditLog({
    adminId: req.user!._id,
    action: 'PROVIDER_APPLICATION_APPROVED',
    targetId: profile._id,
    targetType: 'ProviderProfile',
    details: {
      targetUserId: profile.userId,
      previousStatus,
      newStatus: 'approved',
    },
  }).save();

  // Trigger in-app notification to provider applicant (best-effort, non-blocking)
  await sendInAppNotification({
    recipientId: profile.userId,
    type: 'APPLICATION_APPROVED',
    title: 'Provider Application Approved',
    message: 'Congratulations! Your service provider profile has been approved. You can now accept customer bookings on Dwellio.',
    dedupKey: `application:${profile._id}:approved`,
  });

  const response: ApiResponse<{ application: ReturnType<typeof toProviderProfileData> }> = {
    success: true,
    message: 'Provider application approved successfully.',
    data: {
      application: toProviderProfileData(profile),
    },
  };

  res.status(200).json(response);
};

/**
 * Reject Provider Application (Admin)
 * PATCH /api/admin/providers/applications/:id/reject
 */
export const rejectApplication = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { reason } = req.body;

  if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
    const response: ApiResponse = {
      success: false,
      message: 'Invalid application ID format.',
    };
    res.status(400).json(response);
    return;
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500) {
    const response: ApiResponse = {
      success: false,
      message: 'A rejection reason between 5 and 500 characters is required.',
    };
    res.status(400).json(response);
    return;
  }

  const profile = await ProviderProfile.findById(id);

  if (!profile) {
    const response: ApiResponse = {
      success: false,
      message: 'Provider application not found.',
    };
    res.status(404).json(response);
    return;
  }

  const previousStatus = profile.verificationStatus;

  // 1. Update ProviderProfile
  profile.verificationStatus = 'rejected';
  profile.rejectionReason = reason.trim();
  profile.reviewedBy = req.user!._id;
  profile.reviewedAt = new Date();
  await profile.save();

  // 2. Ensure User role remains 'customer'
  await User.findByIdAndUpdate(profile.userId, { role: 'customer' });

  // 3. Record Audit Log
  await new AuditLog({
    adminId: req.user!._id,
    action: 'PROVIDER_APPLICATION_REJECTED',
    targetId: profile._id,
    targetType: 'ProviderProfile',
    details: {
      targetUserId: profile.userId,
      previousStatus,
      newStatus: 'rejected',
      reason: reason.trim(),
    },
  }).save();

  // Trigger in-app notification to provider applicant (best-effort, non-blocking)
  const safeReason = reason.trim().slice(0, 150);
  await sendInAppNotification({
    recipientId: profile.userId,
    type: 'APPLICATION_REJECTED',
    title: 'Provider Application Update',
    message: `Your provider application was reviewed and could not be approved at this time: "${safeReason}".`,
    dedupKey: `application:${profile._id}:rejected`,
  });

  const response: ApiResponse<{ application: ReturnType<typeof toProviderProfileData> }> = {
    success: true,
    message: 'Provider application rejected successfully.',
    data: {
      application: toProviderProfileData(profile),
    },
  };

  res.status(200).json(response);
};

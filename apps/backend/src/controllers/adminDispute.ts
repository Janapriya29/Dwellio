import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  ApiResponse,
  PaginationMeta,
  DisputeData,
  DisputeStatus,
  DisputeCategory,
} from '@dwellio/shared';
import { Dispute, IDispute } from '../models/Dispute';
import { Booking } from '../models/Booking';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { sendInAppNotification } from '../utils/notification';
import { formatBookingDto } from '../utils/booking';
import { sendInternalError } from '../utils/security';

const formatDisputeDto = (dispute: any, isAdmin: boolean = false): DisputeData => {
  const raisedByUser = dispute.raisedByUserId;
  const raisedAgainstUser = dispute.raisedAgainstUserId;
  const booking = dispute.bookingId;

  return {
    id: dispute._id.toString(),
    bookingId: (booking?._id || dispute.bookingId).toString(),
    booking: booking && typeof booking === 'object' && 'scheduledStartTime' in booking ? formatBookingDto(booking) : undefined,
    raisedByUserId: (raisedByUser?._id || dispute.raisedByUserId).toString(),
    raisedByRole: dispute.raisedByRole,
    raisedAgainstUserId: (raisedAgainstUser?._id || dispute.raisedAgainstUserId).toString(),
    raisedAgainstRole: dispute.raisedAgainstRole,
    customerName: dispute.raisedByRole === 'customer' ? raisedByUser?.name : raisedAgainstUser?.name,
    providerName: dispute.raisedByRole === 'provider' ? raisedByUser?.name : raisedAgainstUser?.name,
    category: dispute.category,
    description: dispute.description,
    status: dispute.status,
    adminNotes: isAdmin ? dispute.adminNotes : undefined,
    resolutionReason: dispute.resolutionReason,
    resolvedByAdminId: dispute.resolvedByAdminId ? dispute.resolvedByAdminId.toString() : undefined,
    resolvedAt: dispute.resolvedAt ? dispute.resolvedAt.toISOString() : undefined,
    createdAt: dispute.createdAt instanceof Date ? dispute.createdAt.toISOString() : new Date(dispute.createdAt).toISOString(),
    updatedAt: dispute.updatedAt instanceof Date ? dispute.updatedAt.toISOString() : new Date(dispute.updatedAt).toISOString(),
  };
};

/**
 * List Platform Disputes (Admin)
 * GET /api/admin/disputes
 */
export const listAdminDisputes = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const { status, category, q } = req.query;

    const filter: Record<string, unknown> = {};

    if (status && status !== 'all') {
      if (!['open', 'under_review', 'resolved', 'rejected'].includes(status as string)) {
        res.status(400).json({
          success: false,
          message: 'Invalid status filter. Must be "open", "under_review", "resolved", "rejected", or "all".',
        });
        return;
      }
      filter.status = status;
    }

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (q && typeof q === 'string' && q.trim().length > 0) {
      const sanitized = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (mongoose.Types.ObjectId.isValid(q.trim())) {
        filter.$or = [
          { _id: new mongoose.Types.ObjectId(q.trim()) },
          { bookingId: new mongoose.Types.ObjectId(q.trim()) },
        ];
      } else {
        filter.description = { $regex: sanitized, $options: 'i' };
      }
    }

    const total = await Dispute.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const rawDisputes = await Dispute.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('raisedByUserId', 'name email role')
      .populate('raisedAgainstUserId', 'name email role')
      .populate({
        path: 'bookingId',
        populate: [
          { path: 'customerId', select: 'name email' },
          { path: 'providerId', select: 'displayName phone' },
          { path: 'serviceId', select: 'name' },
        ],
      });

    const disputes: DisputeData[] = rawDisputes.map((d) => formatDisputeDto(d, true));

    const pagination: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
    };

    res.status(200).json({
      success: true,
      message: 'Disputes retrieved successfully.',
      data: {
        disputes,
        pagination,
      },
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminDispute.listAdminDisputes', error, 'Failed to retrieve disputes.');
  }
};

/**
 * Get Dispute By ID (Admin)
 * GET /api/admin/disputes/:id
 */
export const getAdminDisputeById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid dispute ID format.' });
      return;
    }

    const dispute = await Dispute.findById(id)
      .populate('raisedByUserId', 'name email role')
      .populate('raisedAgainstUserId', 'name email role')
      .populate({
        path: 'bookingId',
        populate: [
          { path: 'customerId', select: 'name email' },
          { path: 'providerId', select: 'displayName phone' },
          { path: 'serviceId', select: 'name' },
        ],
      });

    if (!dispute) {
      res.status(404).json({ success: false, message: 'Dispute record not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Dispute retrieved successfully.',
      data: formatDisputeDto(dispute, true),
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminDispute.getAdminDisputeById', error, 'Failed to retrieve dispute.');
  }
};

/**
 * Resolve or Update Dispute (Admin)
 * PATCH /api/admin/disputes/:id/resolve
 */
export const resolveAdminDispute = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { status, adminNotes, resolutionReason } = req.body;

    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid dispute ID format.' });
      return;
    }

    if (!['under_review', 'resolved', 'rejected'].includes(status)) {
      res.status(400).json({
        success: false,
        message: 'Status must be "under_review", "resolved", or "rejected".',
      });
      return;
    }

    if (['resolved', 'rejected'].includes(status)) {
      if (!resolutionReason || typeof resolutionReason !== 'string' || resolutionReason.trim().length < 5 || resolutionReason.trim().length > 2000) {
        res.status(400).json({
          success: false,
          message: 'A resolution reason between 5 and 2000 characters is required when closing a dispute.',
        });
        return;
      }
    }

    const dispute = await Dispute.findById(id);
    if (!dispute) {
      res.status(404).json({ success: false, message: 'Dispute not found.' });
      return;
    }

    const previousStatus = dispute.status;
    dispute.status = status;
    if (adminNotes !== undefined) dispute.adminNotes = typeof adminNotes === 'string' ? adminNotes.trim() : undefined;
    if (resolutionReason !== undefined) dispute.resolutionReason = typeof resolutionReason === 'string' ? resolutionReason.trim() : undefined;

    if (['resolved', 'rejected'].includes(status)) {
      dispute.resolvedByAdminId = req.user!._id;
      dispute.resolvedAt = new Date();
    }

    await dispute.save();

    // Audit log
    if (req.user) {
      await new AuditLog({
        adminId: req.user._id,
        action: status === 'resolved' ? 'DISPUTE_RESOLVED' : 'DISPUTE_STATUS_CHANGED',
        targetId: dispute._id,
        targetType: 'Dispute',
        details: {
          disputeId: dispute._id,
          bookingId: dispute.bookingId,
          previousStatus,
          newStatus: status,
          reason: resolutionReason?.trim(),
        },
      }).save().catch(() => {});
    }

    // Notify parties if resolved or rejected
    if (['resolved', 'rejected'].includes(status)) {
      const summaryMsg = `Dispute for booking #${dispute.bookingId} was marked as ${status}: "${(resolutionReason || '').trim().slice(0, 150)}".`;
      await Promise.allSettled([
        sendInAppNotification({
          recipientId: dispute.raisedByUserId,
          type: 'DISPUTE_RESOLVED',
          title: `Dispute ${status === 'resolved' ? 'Resolved' : 'Closed'}`,
          message: summaryMsg,
          bookingId: dispute.bookingId,
          dedupKey: `dispute:${dispute._id}:${status}:initiator`,
        }),
        sendInAppNotification({
          recipientId: dispute.raisedAgainstUserId,
          type: 'DISPUTE_RESOLVED',
          title: `Dispute ${status === 'resolved' ? 'Resolved' : 'Closed'}`,
          message: summaryMsg,
          bookingId: dispute.bookingId,
          dedupKey: `dispute:${dispute._id}:${status}:target`,
        }),
      ]);
    }

    const populated = await Dispute.findById(dispute._id)
      .populate('raisedByUserId', 'name email role')
      .populate('raisedAgainstUserId', 'name email role');

    res.status(200).json({
      success: true,
      message: `Dispute status updated to "${status}" successfully.`,
      data: formatDisputeDto(populated || dispute, true),
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminDispute.resolveAdminDispute', error, 'Failed to resolve dispute.');
  }
};

/**
 * Customer / Provider: Raise a Dispute on a Booking
 * POST /api/bookings/:id/disputes
 */
export const createBookingDispute = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    const bookingId = req.params.id as string;
    const { category, description } = req.body;

    if (!bookingId || typeof bookingId !== 'string' || !mongoose.Types.ObjectId.isValid(bookingId)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    const ALLOWED_CATEGORIES: DisputeCategory[] = [
      'service_quality',
      'no_show',
      'pricing_dispute',
      'damage_or_safety',
      'communication',
      'other',
    ];

    if (!category || !ALLOWED_CATEGORIES.includes(category)) {
      res.status(400).json({
        success: false,
        message: `Invalid dispute category. Allowed values: ${ALLOWED_CATEGORIES.join(', ')}`,
      });
      return;
    }

    if (!description || typeof description !== 'string' || description.trim().length < 10 || description.trim().length > 2000) {
      res.status(400).json({
        success: false,
        message: 'A description between 10 and 2000 characters is required.',
      });
      return;
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    const userIdStr = req.user._id.toString();
    const isCustomer = booking.customerId.toString() === userIdStr;
    const isProvider = booking.providerUserId.toString() === userIdStr;

    if (!isCustomer && !isProvider) {
      res.status(403).json({
        success: false,
        message: 'You are not authorized to raise a dispute on this booking.',
      });
      return;
    }

    // Prevent duplicate open disputes
    const existingOpenDispute = await Dispute.findOne({
      bookingId: booking._id,
      status: { $in: ['open', 'under_review'] },
    });

    if (existingOpenDispute) {
      res.status(409).json({
        success: false,
        message: 'An active dispute is already in progress for this booking.',
      });
      return;
    }

    const raisedByRole = isCustomer ? 'customer' : 'provider';
    const raisedAgainstRole = isCustomer ? 'provider' : 'customer';
    const raisedAgainstUserId = isCustomer ? booking.providerUserId : booking.customerId;

    const dispute = new Dispute({
      bookingId: booking._id,
      raisedByUserId: req.user._id,
      raisedByRole,
      raisedAgainstUserId,
      raisedAgainstRole,
      category,
      description: description.trim(),
      status: 'open',
    });

    await dispute.save();

    // Audit log
    await new AuditLog({
      adminId: req.user._id,
      action: 'DISPUTE_CREATED',
      targetId: dispute._id,
      targetType: 'Dispute',
      details: {
        disputeId: dispute._id,
        bookingId: booking._id,
        raisedByRole,
        category,
      },
    }).save().catch(() => {});

    // Notify the other party
    await sendInAppNotification({
      recipientId: raisedAgainstUserId,
      type: 'DISPUTE_RAISED',
      title: 'Dispute Raised on Booking',
      message: `A dispute regarding "${category.replace(/_/g, ' ')}" was raised on booking #${booking._id}. Administration has been notified.`,
      bookingId: booking._id,
      dedupKey: `dispute:${dispute._id}:raised`,
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Dispute submitted successfully. Administration has received your inquiry.',
      data: formatDisputeDto(dispute, false),
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminDispute.createBookingDispute', error, 'Failed to submit dispute.');
  }
};

/**
 * Customer / Provider: Get Disputes on a Booking
 * GET /api/bookings/:id/disputes
 */
export const getBookingDisputes = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    const bookingId = req.params.id as string;
    if (!bookingId || typeof bookingId !== 'string' || !mongoose.Types.ObjectId.isValid(bookingId)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    const userIdStr = req.user._id.toString();
    const isCustomer = booking.customerId.toString() === userIdStr;
    const isProvider = booking.providerUserId.toString() === userIdStr;
    const isAdmin = req.user.role === 'admin';

    if (!isCustomer && !isProvider && !isAdmin) {
      res.status(403).json({
        success: false,
        message: 'You are not authorized to view disputes for this booking.',
      });
      return;
    }

    const disputes = await Dispute.find({ bookingId: booking._id })
      .sort({ createdAt: -1 })
      .populate('raisedByUserId', 'name email role')
      .populate('raisedAgainstUserId', 'name email role');

    res.status(200).json({
      success: true,
      message: 'Booking disputes retrieved successfully.',
      data: disputes.map((d) => formatDisputeDto(d, isAdmin)),
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminDispute.getBookingDisputes', error, 'Failed to retrieve booking disputes.');
  }
};

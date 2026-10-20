import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { ApiResponse, NotificationData, NotificationUnreadCountData, MarkAllReadResponseData, PaginationMeta } from '@dwellio/shared';
import { Notification } from '../models/Notification';
import { formatNotificationDto } from '../utils/notification';
import { sendInternalError } from '../utils/security';

/**
 * List paginated notifications for the authenticated recipient
 * GET /api/notifications?page=1&limit=15&unreadOnly=false
 */
export const listNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 15));
    const unreadOnly = req.query.unreadOnly === 'true';

    // Strictly derive recipient identity from req.user._id
    const filter: Record<string, unknown> = {
      recipientId: req.user._id,
    };

    if (unreadOnly) {
      filter.isRead = false;
    }

    const total = await Notification.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const pagination: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
    };

    const response: ApiResponse<NotificationData[]> & { pagination: PaginationMeta } = {
      success: true,
      message: 'Notifications retrieved successfully.',
      data: notifications.map(formatNotificationDto),
      pagination,
    };

    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'Notification.listNotifications', error, 'Failed to retrieve notifications.');
  }
};

/**
 * Get count of unread notifications for the authenticated recipient
 * GET /api/notifications/unread-count
 */
export const getUnreadNotificationCount = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    // Strictly derive recipient identity from req.user._id
    const unreadCount = await Notification.countDocuments({
      recipientId: req.user._id,
      isRead: false,
    });

    const response: ApiResponse<NotificationUnreadCountData> = {
      success: true,
      message: 'Unread notification count retrieved.',
      data: {
        unreadCount,
      },
    };

    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'Notification.getUnreadNotificationCount', error, 'Failed to retrieve unread notification count.');
  }
};

/**
 * Mark a single notification as read
 * PATCH /api/notifications/:id/read
 */
export const markNotificationAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid notification ID format.' });
      return;
    }

    // Strictly ensure recipientId matches authenticated user; return 404 if not found or unauthorized
    const notification = await Notification.findOne({
      _id: id,
      recipientId: req.user._id,
    });

    if (!notification) {
      res.status(404).json({ success: false, message: 'Notification not found.' });
      return;
    }

    // Idempotency: if already read, do NOT reset or overwrite original readAt
    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await notification.save();
    }

    const response: ApiResponse<NotificationData> = {
      success: true,
      message: 'Notification marked as read.',
      data: formatNotificationDto(notification),
    };

    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'Notification.markNotificationAsRead', error, 'Failed to mark notification as read.');
  }
};

/**
 * Mark all unread notifications as read for the authenticated recipient
 * PATCH /api/notifications/read-all
 */
export const markAllNotificationsAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    // Updates only currently unread notifications belonging to the authenticated user
    const result = await Notification.updateMany(
      {
        recipientId: req.user._id,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );

    const response: ApiResponse<MarkAllReadResponseData> = {
      success: true,
      message: 'All notifications marked as read.',
      data: {
        markedCount: result.modifiedCount,
      },
    };

    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'Notification.markAllNotificationsAsRead', error, 'Failed to mark all notifications as read.');
  }
};

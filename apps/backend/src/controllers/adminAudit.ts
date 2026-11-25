import { Request, Response } from 'express';
import { ApiResponse, PaginationMeta, AuditLogData, AuditLogAction } from '@dwellio/shared';
import { AuditLog } from '../models/AuditLog';
import { sendInternalError } from '../utils/security';

const VALID_ACTIONS: AuditLogAction[] = [
  'PROVIDER_APPLICATION_APPROVED',
  'PROVIDER_APPLICATION_REJECTED',
  'CATEGORY_CREATED',
  'CATEGORY_UPDATED',
  'CATEGORY_STATUS_CHANGED',
  'SERVICE_CREATED',
  'SERVICE_UPDATED',
  'SERVICE_STATUS_CHANGED',
  'REVIEW_MODERATED',
];

/**
 * List Platform Audit Logs (Admin Audit Trail)
 * GET /api/admin/audit-logs
 */
export const listAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const { action } = req.query;

    const filter: Record<string, unknown> = {};

    if (action && typeof action === 'string') {
      if (!VALID_ACTIONS.includes(action as AuditLogAction)) {
        res.status(400).json({
          success: false,
          message: `Invalid action filter. Allowed values: ${VALID_ACTIONS.join(', ')}`,
        });
        return;
      }
      filter.action = action;
    }

    const total = await AuditLog.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const rawLogs = await AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('adminId', 'name email');

    const auditLogs: AuditLogData[] = rawLogs.map((log: any) => {
      const adminDoc = log.adminId;
      return {
        id: log._id.toString(),
        adminId: (adminDoc?._id || adminDoc || '').toString(),
        adminName: adminDoc?.name || 'Administrator',
        adminEmail: adminDoc?.email,
        action: log.action,
        targetId: log.targetId ? log.targetId.toString() : '',
        targetType: log.targetType || 'General',
        details: log.details || {},
        createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : new Date(log.createdAt).toISOString(),
      };
    });

    const pagination: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
    };

    const response: ApiResponse<{ auditLogs: AuditLogData[]; pagination: PaginationMeta }> = {
      success: true,
      message: 'Audit logs retrieved successfully.',
      data: {
        auditLogs,
        pagination,
      },
    };

    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'AdminAudit.listAuditLogs', error, 'Failed to retrieve audit logs.');
  }
};

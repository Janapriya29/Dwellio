import { Request, Response } from 'express';
import { ApiResponse, PlatformSettingsData } from '@dwellio/shared';
import { getOrCreatePlatformSettings, PlatformSetting } from '../models/PlatformSetting';
import { AuditLog } from '../models/AuditLog';
import { sendInternalError } from '../utils/security';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Get Platform Settings (Admin)
 * GET /api/admin/settings
 */
export const getAdminSettings = async (_req: Request, res: Response): Promise<void> => {
  try {
    const settings = await getOrCreatePlatformSettings();
    await settings.populate('updatedByAdminId', 'email name');

    const adminDoc: any = settings.updatedByAdminId;
    const data: PlatformSettingsData = {
      platformCommissionPercent: settings.platformCommissionPercent,
      supportEmail: settings.supportEmail,
      supportPhone: settings.supportPhone,
      emergencyMaintenanceNotice: {
        enabled: settings.emergencyMaintenanceNotice?.enabled ?? false,
        message: settings.emergencyMaintenanceNotice?.message ?? '',
      },
      updatedAt: settings.updatedAt ? settings.updatedAt.toISOString() : undefined,
      updatedByAdminEmail: adminDoc?.email,
    };

    res.status(200).json({
      success: true,
      message: 'Platform settings retrieved successfully.',
      data,
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminSettings.getAdminSettings', error, 'Failed to retrieve platform settings.');
  }
};

/**
 * Update Platform Settings (Admin)
 * PUT /api/admin/settings
 */
export const updateAdminSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      platformCommissionPercent,
      supportEmail,
      supportPhone,
      emergencyMaintenanceNotice,
    } = req.body;

    const settings = await getOrCreatePlatformSettings();
    const previousCommission = settings.platformCommissionPercent;
    const previousSupportEmail = settings.supportEmail;

    if (platformCommissionPercent !== undefined) {
      if (
        typeof platformCommissionPercent !== 'number' ||
        isNaN(platformCommissionPercent) ||
        !isFinite(platformCommissionPercent) ||
        platformCommissionPercent < 0 ||
        platformCommissionPercent > 50
      ) {
        res.status(400).json({
          success: false,
          message: 'Platform commission must be a number between 0% and 50%.',
        });
        return;
      }
      settings.platformCommissionPercent = Math.round(platformCommissionPercent);
    }

    if (supportEmail !== undefined) {
      if (typeof supportEmail !== 'string' || !EMAIL_REGEX.test(supportEmail.trim())) {
        res.status(400).json({
          success: false,
          message: 'Please provide a valid support email address.',
        });
        return;
      }
      settings.supportEmail = supportEmail.trim().toLowerCase();
    }

    if (supportPhone !== undefined) {
      if (typeof supportPhone !== 'string' || supportPhone.trim().length < 7 || supportPhone.trim().length > 25) {
        res.status(400).json({
          success: false,
          message: 'Support phone must be between 7 and 25 characters.',
        });
        return;
      }
      settings.supportPhone = supportPhone.trim();
    }

    if (emergencyMaintenanceNotice !== undefined) {
      if (typeof emergencyMaintenanceNotice !== 'object' || emergencyMaintenanceNotice === null) {
        res.status(400).json({
          success: false,
          message: 'Emergency maintenance notice must be an object with enabled boolean and message string.',
        });
        return;
      }

      settings.emergencyMaintenanceNotice = {
        enabled: Boolean(emergencyMaintenanceNotice.enabled),
        message: typeof emergencyMaintenanceNotice.message === 'string' ? emergencyMaintenanceNotice.message.trim().slice(0, 500) : '',
      };
    }

    if (req.user) {
      settings.updatedByAdminId = req.user._id;
    }

    await settings.save();

    // Record immutable audit log
    if (req.user) {
      await new AuditLog({
        adminId: req.user._id,
        action: 'PLATFORM_SETTINGS_UPDATED',
        targetId: settings._id,
        targetType: 'PlatformSetting',
        details: {
          previousCommission,
          newCommission: settings.platformCommissionPercent,
          previousSupportEmail,
          newSupportEmail: settings.supportEmail,
          emergencyNoticeEnabled: settings.emergencyMaintenanceNotice.enabled,
        },
      }).save().catch(() => {});
    }

    const data: PlatformSettingsData = {
      platformCommissionPercent: settings.platformCommissionPercent,
      supportEmail: settings.supportEmail,
      supportPhone: settings.supportPhone,
      emergencyMaintenanceNotice: settings.emergencyMaintenanceNotice,
      updatedAt: settings.updatedAt.toISOString(),
      updatedByAdminEmail: req.user?.email,
    };

    res.status(200).json({
      success: true,
      message: 'Platform settings updated successfully.',
      data,
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminSettings.updateAdminSettings', error, 'Failed to update platform settings.');
  }
};

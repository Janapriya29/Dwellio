import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { PlatformSettingsData } from '@dwellio/shared';

export interface IPlatformSetting extends Document {
  key: string;
  platformCommissionPercent: number;
  supportEmail: string;
  supportPhone: string;
  emergencyMaintenanceNotice: {
    enabled: boolean;
    message: string;
  };
  updatedByAdminId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const platformSettingSchema = new Schema<IPlatformSetting>(
  {
    key: {
      type: String,
      default: 'global',
      unique: true,
      index: true,
    },
    platformCommissionPercent: {
      type: Number,
      required: true,
      default: 15,
      min: [0, 'Platform commission cannot be negative'],
      max: [50, 'Platform commission cannot exceed 50%'],
    },
    supportEmail: {
      type: String,
      required: true,
      default: 'support@dwellio.com',
      trim: true,
    },
    supportPhone: {
      type: String,
      required: true,
      default: '+91 98400 12345',
      trim: true,
    },
    emergencyMaintenanceNotice: {
      enabled: {
        type: Boolean,
        default: false,
      },
      message: {
        type: String,
        default: '',
        trim: true,
        maxlength: [500, 'Notice cannot exceed 500 characters'],
      },
    },
    updatedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

export const getOrCreatePlatformSettings = async (): Promise<IPlatformSetting> => {
  let settings = await PlatformSetting.findOne({ key: 'global' });
  if (!settings) {
    settings = await PlatformSetting.create({
      key: 'global',
      platformCommissionPercent: 15,
      supportEmail: 'support@dwellio.com',
      supportPhone: '+91 98400 12345',
      emergencyMaintenanceNotice: {
        enabled: false,
        message: '',
      },
    });
  }
  return settings;
};

export const PlatformSetting: Model<IPlatformSetting> =
  mongoose.models.PlatformSetting || mongoose.model<IPlatformSetting>('PlatformSetting', platformSettingSchema);

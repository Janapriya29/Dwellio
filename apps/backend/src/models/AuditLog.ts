import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { AuditLogAction } from '@dwellio/shared';

export interface IAuditLog extends Document {
  adminId: Types.ObjectId;
  action: AuditLogAction;
  targetId: Types.ObjectId;
  targetType: string;
  details?: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Administrator ID is required'],
      index: true,
    },
    action: {
      type: String,
      required: [true, 'Audit action is required'],
      index: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: [true, 'Target resource ID is required'],
      index: true,
    },
    targetType: {
      type: String,
      required: [true, 'Target resource type is required'],
      default: 'ProviderProfile',
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable append-only audit trail
  }
);

export const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { BookingStatus, BookingActorRole, ServiceAddress } from '@dwellio/shared';

export interface IBookingStatusHistory {
  actorId: Types.ObjectId;
  actorRole: BookingActorRole;
  fromStatus: BookingStatus;
  toStatus: BookingStatus;
  timestamp: Date;
  reason?: string;
}

export interface IBooking extends Document {
  customerId: Types.ObjectId;
  providerId: Types.ObjectId;
  providerUserId: Types.ObjectId;
  serviceId: Types.ObjectId;
  categoryId: Types.ObjectId;
  scheduledStartTime: Date;
  scheduledEndTime: Date;
  address: ServiceAddress;
  customerNotes?: string;
  status: BookingStatus;
  cancellationReason?: string;
  rejectionReason?: string;
  statusHistory: IBookingStatusHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const statusHistorySchema = new Schema<IBookingStatusHistory>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorRole: {
      type: String,
      enum: ['customer', 'provider', 'admin'],
      required: true,
    },
    fromStatus: {
      type: String,
      enum: ['requested', 'accepted', 'on_the_way', 'in_progress', 'completed', 'cancelled', 'rejected'],
      required: true,
    },
    toStatus: {
      type: String,
      enum: ['requested', 'accepted', 'on_the_way', 'in_progress', 'completed', 'cancelled', 'rejected'],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },
  },
  { _id: false }
);

const addressSchema = new Schema<ServiceAddress>(
  {
    street: {
      type: String,
      required: [true, 'Street address is required'],
      trim: true,
      maxlength: [200, 'Street cannot exceed 200 characters'],
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      maxlength: [100, 'City cannot exceed 100 characters'],
    },
    postalCode: {
      type: String,
      trim: true,
      maxlength: [20, 'Postal code cannot exceed 20 characters'],
    },
    landmark: {
      type: String,
      trim: true,
      maxlength: [150, 'Landmark cannot exceed 150 characters'],
    },
  },
  { _id: false }
);

const bookingSchema = new Schema<IBooking>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer ID reference is required'],
      index: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: 'ProviderProfile',
      required: [true, 'Provider profile reference is required'],
      index: true,
    },
    providerUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Provider user reference is required'],
      index: true,
    },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: 'Service',
      required: [true, 'Service reference is required'],
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category reference is required'],
      index: true,
    },
    scheduledStartTime: {
      type: Date,
      required: [true, 'Scheduled start time is required'],
    },
    scheduledEndTime: {
      type: Date,
      required: [true, 'Scheduled end time is required'],
    },
    address: {
      type: addressSchema,
      required: [true, 'Service address is required'],
    },
    customerNotes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },
    status: {
      type: String,
      enum: ['requested', 'accepted', 'on_the_way', 'in_progress', 'completed', 'cancelled', 'rejected'],
      default: 'requested',
      index: true,
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Cancellation reason cannot exceed 500 characters'],
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound Indexes for fast queries & conflict checking
bookingSchema.index({ customerId: 1, createdAt: -1 });
bookingSchema.index({ providerId: 1, scheduledStartTime: 1, scheduledEndTime: 1 });
bookingSchema.index({ providerId: 1, status: 1 });
bookingSchema.index({ providerUserId: 1, createdAt: -1 });

export const Booking: Model<IBooking> = mongoose.model<IBooking>('Booking', bookingSchema);

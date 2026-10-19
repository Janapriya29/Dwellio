import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface ISlotReservation extends Document {
  providerId: Types.ObjectId;
  slotTime: Date;
  bookingId: Types.ObjectId;
  createdAt: Date;
}

const slotReservationSchema = new Schema<ISlotReservation>(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: 'ProviderProfile',
      required: [true, 'Provider ID is required'],
    },
    slotTime: {
      type: Date,
      required: [true, 'Slot time is required'],
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking ID is required'],
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Compound Unique Index: strictly ensures a provider cannot have duplicate reservations for the same time bucket
slotReservationSchema.index({ providerId: 1, slotTime: 1 }, { unique: true });

export const SlotReservation: Model<ISlotReservation> = mongoose.model<ISlotReservation>(
  'SlotReservation',
  slotReservationSchema
);

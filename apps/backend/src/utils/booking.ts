import mongoose, { Types } from 'mongoose';
import { BookingData, BookingStatusHistoryEntry } from '@dwellio/shared';
import { Booking, IBooking } from '../models/Booking';
import { SlotReservation } from '../models/SlotReservation';

export const RESERVED_STATUSES = ['accepted', 'on_the_way', 'in_progress'] as const;

/**
 * Maps a Mongoose Booking document (with optional populated fields) to a safe client DTO.
 */
export const formatBookingDto = (booking: any): BookingData => {
  const customer = booking.customerId && typeof booking.customerId === 'object' && 'name' in booking.customerId
    ? {
        id: booking.customerId._id.toString(),
        name: booking.customerId.name,
        email: booking.customerId.email,
        phone: booking.customerId.phone,
      }
    : undefined;

  const provider = booking.providerId && typeof booking.providerId === 'object' && 'displayName' in booking.providerId
    ? {
        id: booking.providerId._id.toString(),
        displayName: booking.providerId.displayName,
        phone: booking.providerId.phone,
        serviceArea: booking.providerId.serviceArea,
        skills: booking.providerId.skills,
      }
    : undefined;

  const service = booking.serviceId && typeof booking.serviceId === 'object' && 'name' in booking.serviceId
    ? {
        id: booking.serviceId._id.toString(),
        name: booking.serviceId.name,
        slug: booking.serviceId.slug,
      }
    : undefined;

  const category = booking.categoryId && typeof booking.categoryId === 'object' && 'name' in booking.categoryId
    ? {
        id: booking.categoryId._id.toString(),
        name: booking.categoryId.name,
        slug: booking.categoryId.slug,
      }
    : undefined;

  const statusHistory: BookingStatusHistoryEntry[] = (booking.statusHistory || []).map((h: any) => ({
    actorId: h.actorId ? h.actorId.toString() : '',
    actorRole: h.actorRole,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    timestamp: h.timestamp instanceof Date ? h.timestamp.toISOString() : new Date(h.timestamp).toISOString(),
    reason: h.reason,
  }));

  return {
    id: booking._id.toString(),
    customerId: (booking.customerId?._id || booking.customerId).toString(),
    customer,
    providerId: (booking.providerId?._id || booking.providerId).toString(),
    providerUserId: (booking.providerUserId?._id || booking.providerUserId).toString(),
    provider,
    serviceId: (booking.serviceId?._id || booking.serviceId).toString(),
    service,
    categoryId: (booking.categoryId?._id || booking.categoryId).toString(),
    category,
    scheduledStartTime: booking.scheduledStartTime instanceof Date
      ? booking.scheduledStartTime.toISOString()
      : new Date(booking.scheduledStartTime).toISOString(),
    scheduledEndTime: booking.scheduledEndTime instanceof Date
      ? booking.scheduledEndTime.toISOString()
      : new Date(booking.scheduledEndTime).toISOString(),
    address: {
      street: booking.address?.street || '',
      city: booking.address?.city || '',
      postalCode: booking.address?.postalCode,
      landmark: booking.address?.landmark,
    },
    customerNotes: booking.customerNotes,
    status: booking.status,
    cancellationReason: booking.cancellationReason,
    rejectionReason: booking.rejectionReason,
    statusHistory,
    priceSnapshot: booking.priceSnapshot,
    paymentStatus: booking.paymentStatus,
    commissionRateSnapshot: booking.commissionRateSnapshot,
    commissionAmountSnapshot: booking.commissionAmountSnapshot,
    paymentDueAt: booking.paymentDueAt instanceof Date
      ? booking.paymentDueAt.toISOString()
      : booking.paymentDueAt ? new Date(booking.paymentDueAt).toISOString() : undefined,
    paymentCompletedAt: booking.paymentCompletedAt instanceof Date
      ? booking.paymentCompletedAt.toISOString()
      : booking.paymentCompletedAt ? new Date(booking.paymentCompletedAt).toISOString() : undefined,
    razorpayOrderId: booking.razorpayOrderId,
    razorpayPaymentId: booking.razorpayPaymentId,
    appliedCouponCode: booking.appliedCouponCode,
    discountAmount: booking.discountAmount,
    finalPayableAmount: booking.finalPayableAmount,
    refundAmount: booking.refundAmount,
    refundStatus: booking.refundStatus,
    createdAt: booking.createdAt instanceof Date ? booking.createdAt.toISOString() : new Date(booking.createdAt).toISOString(),
    updatedAt: booking.updatedAt instanceof Date ? booking.updatedAt.toISOString() : new Date(booking.updatedAt).toISOString(),
  };
};

/**
 * Checks if a service provider already has an accepted/in-progress booking that overlaps with the candidate interval.
 * Two intervals [A.start, A.end] and [B.start, B.end] overlap iff A.start < B.end && A.end > B.start.
 */
export const findConflictingProviderBooking = async (
  providerId: Types.ObjectId | string,
  startTime: Date,
  endTime: Date,
  excludeBookingId?: Types.ObjectId | string
): Promise<IBooking | null> => {
  const query: any = {
    providerId: new Types.ObjectId(providerId.toString()),
    status: { $in: RESERVED_STATUSES },
    scheduledStartTime: { $lt: endTime },
    scheduledEndTime: { $gt: startTime },
  };

  if (excludeBookingId) {
    query._id = { $ne: new Types.ObjectId(excludeBookingId.toString()) };
  }

  return Booking.findOne(query);
};

export const BUCKET_MINUTES = 15;
export const BUCKET_MS = BUCKET_MINUTES * 60 * 1000;

/**
 * Computes all 15-minute discrete slot boundary timestamps that intersect the given interval [startTime, endTime).
 * Half-open interval convention [start, end) ensures that non-overlapping adjacent appointments
 * (e.g. 09:00–11:00 and 11:00–13:00) share zero slot timestamps.
 */
export const generateSlotTimes = (startTime: Date, endTime: Date): Date[] => {
  const startMs = startTime.getTime();
  const endMs = endTime.getTime();
  const firstSlotMs = Math.floor(startMs / BUCKET_MS) * BUCKET_MS;
  const slots: Date[] = [];

  for (let t = firstSlotMs; t < endMs; t += BUCKET_MS) {
    if (t + BUCKET_MS > startMs && t < endMs) {
      slots.push(new Date(t));
    }
  }

  return slots;
};

/**
 * Atomically reserves discrete slot locks for a provider and booking using MongoDB's unique index constraint.
 * If another booking has concurrently reserved any overlapping slot, the insert will fail with duplicate key (E11000),
 * safely rolling back any partial inserts and returning a conflict indication.
 */
export const acquireProviderSlots = async (
  providerId: Types.ObjectId | string,
  startTime: Date,
  endTime: Date,
  bookingId: Types.ObjectId | string
): Promise<{ success: boolean; conflict?: boolean; error?: string }> => {
  const pId = new Types.ObjectId(providerId.toString());
  const bId = new Types.ObjectId(bookingId.toString());
  const slotTimes = generateSlotTimes(startTime, endTime);

  if (slotTimes.length === 0) {
    return { success: false, error: 'Invalid scheduling window.' };
  }

  try {
    const docs = slotTimes.map((slotTime) => ({
      providerId: pId,
      slotTime,
      bookingId: bId,
    }));

    await SlotReservation.insertMany(docs, { ordered: true });
    return { success: true };
  } catch (err: any) {
    const isDuplicate =
      err.code === 11000 ||
      err.name === 'MongoBulkWriteError' ||
      (err.writeErrors && Array.isArray(err.writeErrors) && err.writeErrors.some((e: any) => e.code === 11000)) ||
      (typeof err.message === 'string' && err.message.includes('E11000'));

    // Release any slots partially inserted for this booking in this batch
    await SlotReservation.deleteMany({ bookingId: bId });

    if (isDuplicate) {
      return { success: false, conflict: true };
    }
    throw err;
  }
};

/**
 * Releases all slot reservations associated with a booking (e.g. upon cancellation, completion, or decline).
 */
export const releaseProviderSlots = async (
  bookingId: Types.ObjectId | string
): Promise<void> => {
  const bId = new Types.ObjectId(bookingId.toString());
  await SlotReservation.deleteMany({ bookingId: bId });
};

export interface SlotMigrationResult {
  success: boolean;
  conflict?: boolean;
  error?: string;
}

/**
 * Concurrency-Safe Slot Migration for Rescheduling:
 * Secures new slot buckets before releasing old buckets.
 * Calculates delta between old and new reservation buckets.
 * If acquisition fails, rolls back newly acquired buckets and keeps old reservations intact.
 */
export const migrateProviderSlots = async (
  providerId: Types.ObjectId | string,
  oldStartTime: Date,
  oldEndTime: Date,
  newStartTime: Date,
  newEndTime: Date,
  bookingId: Types.ObjectId | string
): Promise<SlotMigrationResult> => {
  const pId = new Types.ObjectId(providerId.toString());
  const bId = new Types.ObjectId(bookingId.toString());

  const oldSlots = generateSlotTimes(oldStartTime, oldEndTime);
  const newSlots = generateSlotTimes(newStartTime, newEndTime);

  if (newSlots.length === 0) {
    return { success: false, error: 'Invalid scheduling window.' };
  }

  const oldSlotTimesSet = new Set(oldSlots.map((d) => d.getTime()));
  const toAdd = newSlots.filter((d) => !oldSlotTimesSet.has(d.getTime()));

  // Attempt to acquire newly required slot buckets
  if (toAdd.length > 0) {
    try {
      const docs = toAdd.map((slotTime) => ({
        providerId: pId,
        slotTime,
        bookingId: bId,
      }));
      await SlotReservation.insertMany(docs, { ordered: true });
    } catch (err: any) {
      const isDuplicate =
        err.code === 11000 ||
        err.name === 'MongoBulkWriteError' ||
        (err.writeErrors && Array.isArray(err.writeErrors) && err.writeErrors.some((e: any) => e.code === 11000)) ||
        (typeof err.message === 'string' && err.message.includes('E11000'));

      // Rollback only the newly attempted buckets; existing old buckets remain completely safe
      await SlotReservation.deleteMany({
        bookingId: bId,
        slotTime: { $in: toAdd },
      });

      if (isDuplicate) {
        return { success: false, conflict: true };
      }
      throw err;
    }
  }

  return { success: true };
};

/**
 * Releases obsolete slot buckets no longer required after successful booking schedule update.
 */
export const cleanupObsoleteSlots = async (
  bookingId: Types.ObjectId | string,
  oldStartTime: Date,
  oldEndTime: Date,
  newStartTime: Date,
  newEndTime: Date
): Promise<void> => {
  const bId = new Types.ObjectId(bookingId.toString());
  const oldSlots = generateSlotTimes(oldStartTime, oldEndTime);
  const newSlots = generateSlotTimes(newStartTime, newEndTime);
  const newSlotTimesSet = new Set(newSlots.map((d) => d.getTime()));
  const toRemove = oldSlots.filter((d) => !newSlotTimesSet.has(d.getTime()));

  if (toRemove.length > 0) {
    await SlotReservation.deleteMany({
      bookingId: bId,
      slotTime: { $in: toRemove },
    });
  }
};

/**
 * Rolls back newly acquired slots if booking schedule update fails after acquiring them.
 */
export const rollbackNewSlots = async (
  bookingId: Types.ObjectId | string,
  oldStartTime: Date,
  oldEndTime: Date,
  newStartTime: Date,
  newEndTime: Date
): Promise<void> => {
  const bId = new Types.ObjectId(bookingId.toString());
  const oldSlots = generateSlotTimes(oldStartTime, oldEndTime);
  const newSlots = generateSlotTimes(newStartTime, newEndTime);
  const oldSlotTimesSet = new Set(oldSlots.map((d) => d.getTime()));
  const toAdd = newSlots.filter((d) => !oldSlotTimesSet.has(d.getTime()));

  if (toAdd.length > 0) {
    await SlotReservation.deleteMany({
      bookingId: bId,
      slotTime: { $in: toAdd },
    });
  }
};

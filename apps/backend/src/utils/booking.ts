import mongoose, { Types } from 'mongoose';
import { BookingData, BookingStatusHistoryEntry } from '@dwellio/shared';
import { Booking, IBooking } from '../models/Booking';

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

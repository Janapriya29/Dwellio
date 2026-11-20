import { Request, Response } from 'express';
import {
  ApiResponse,
  ProviderScheduleData,
  UpdateProviderSchedulePayload,
  UpdateAvailabilityStatusPayload,
  STANDARD_TIME_SLOTS,
} from '@dwellio/shared';
import { ProviderProfile } from '../models/ProviderProfile';
import { sendInternalError } from '../utils/security';

const VALID_SLOT_INDICES = STANDARD_TIME_SLOTS.map((s) => s.slotIndex); // [0, 1, 2, 3]

/**
 * Provider: Get operating schedule, blocked dates, and job acceptance status
 * GET /api/provider/schedule
 */
export const getMySchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider profile required.' });
      return;
    }

    const data: ProviderScheduleData = {
      isAcceptingJobs: req.providerProfile.isAcceptingJobs ?? true,
      workingSchedule: req.providerProfile.workingSchedule || [],
      blockedDates: req.providerProfile.blockedDates || [],
    };

    const response: ApiResponse<ProviderScheduleData> = {
      success: true,
      message: 'Provider schedule retrieved successfully.',
      data,
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'ProviderSchedule.getMySchedule', error, 'Failed to retrieve schedule.');
  }
};

/**
 * Provider: Update weekly working schedule and blocked dates
 * PUT /api/provider/schedule
 */
export const updateMySchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider profile required.' });
      return;
    }

    const payload: UpdateProviderSchedulePayload = req.body || {};

    if (!payload.workingSchedule || !Array.isArray(payload.workingSchedule)) {
      res.status(400).json({
        success: false,
        message: 'workingSchedule must be provided as an array of daily configurations.',
      });
      return;
    }

    // Validate workingSchedule entries
    const seenDays = new Set<number>();
    const cleanedSchedule = [];

    for (const item of payload.workingSchedule) {
      if (
        typeof item.dayOfWeek !== 'number' ||
        !Number.isInteger(item.dayOfWeek) ||
        item.dayOfWeek < 0 ||
        item.dayOfWeek > 6
      ) {
        res.status(400).json({
          success: false,
          message: 'dayOfWeek must be an integer between 0 (Sunday) and 6 (Saturday).',
        });
        return;
      }

      if (seenDays.has(item.dayOfWeek)) {
        res.status(400).json({
          success: false,
          message: `Duplicate dayOfWeek ${item.dayOfWeek} specified in schedule.`,
        });
        return;
      }
      seenDays.add(item.dayOfWeek);

      if (!Array.isArray(item.activeSlotIndices)) {
        res.status(400).json({
          success: false,
          message: `activeSlotIndices for day ${item.dayOfWeek} must be an array of slot numbers.`,
        });
        return;
      }

      for (const slotIdx of item.activeSlotIndices) {
        if (!VALID_SLOT_INDICES.includes(slotIdx)) {
          res.status(400).json({
            success: false,
            message: `Invalid slotIndex ${slotIdx}. Allowed slot indices: [${VALID_SLOT_INDICES.join(', ')}].`,
          });
          return;
        }
      }

      const uniqueSlots = Array.from(new Set(item.activeSlotIndices)).sort((a, b) => a - b);
      cleanedSchedule.push({
        dayOfWeek: item.dayOfWeek,
        activeSlotIndices: uniqueSlots,
      });
    }

    // Validate blockedDates if provided
    const cleanedBlockedDates = [];
    if (payload.blockedDates !== undefined) {
      if (!Array.isArray(payload.blockedDates)) {
        res.status(400).json({
          success: false,
          message: 'blockedDates must be an array.',
        });
        return;
      }

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const seenDates = new Set<string>();

      for (const b of payload.blockedDates) {
        if (!b.date || typeof b.date !== 'string' || !dateRegex.test(b.date.trim())) {
          res.status(400).json({
            success: false,
            message: 'Each blocked date must be in YYYY-MM-DD format.',
          });
          return;
        }

        const cleanDate = b.date.trim();
        // Check date validity
        const [year, month, day] = cleanDate.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        if (
          isNaN(dateObj.getTime()) ||
          dateObj.getFullYear() !== year ||
          dateObj.getMonth() !== month - 1 ||
          dateObj.getDate() !== day
        ) {
          res.status(400).json({
            success: false,
            message: `Invalid calendar date '${cleanDate}' in blocked dates.`,
          });
          return;
        }

        if (seenDates.has(cleanDate)) {
          continue; // Deduplicate
        }
        seenDates.add(cleanDate);

        let cleanReason: string | undefined;
        if (b.reason !== undefined) {
          if (typeof b.reason !== 'string' || b.reason.trim().length > 200) {
            res.status(400).json({
              success: false,
              message: 'Blocked date reason cannot exceed 200 characters.',
            });
            return;
          }
          cleanReason = b.reason.trim() || undefined;
        }

        cleanedBlockedDates.push({
          date: cleanDate,
          reason: cleanReason,
        });
      }
    }

    // Save to profile
    req.providerProfile.workingSchedule = cleanedSchedule;
    if (payload.blockedDates !== undefined) {
      req.providerProfile.blockedDates = cleanedBlockedDates;
    }
    await req.providerProfile.save();

    const data: ProviderScheduleData = {
      isAcceptingJobs: req.providerProfile.isAcceptingJobs ?? true,
      workingSchedule: req.providerProfile.workingSchedule,
      blockedDates: req.providerProfile.blockedDates || [],
    };

    const response: ApiResponse<ProviderScheduleData> = {
      success: true,
      message: 'Provider working schedule updated successfully.',
      data,
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'ProviderSchedule.updateMySchedule', error, 'Failed to update schedule.');
  }
};

/**
 * Provider: Instant toggle for accepting jobs status (ON/OFF)
 * PATCH /api/provider/availability-status
 */
export const updateMyAvailabilityStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider profile required.' });
      return;
    }

    const { isAcceptingJobs }: UpdateAvailabilityStatusPayload = req.body || {};

    if (typeof isAcceptingJobs !== 'boolean') {
      res.status(400).json({
        success: false,
        message: 'isAcceptingJobs must be a boolean value.',
      });
      return;
    }

    req.providerProfile.isAcceptingJobs = isAcceptingJobs;
    await req.providerProfile.save();

    const response: ApiResponse<{ isAcceptingJobs: boolean }> = {
      success: true,
      message: isAcceptingJobs
        ? 'You are now online and accepting new booking requests.'
        : 'Job intake paused. You will not receive new booking requests.',
      data: { isAcceptingJobs },
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'ProviderSchedule.updateMyAvailabilityStatus', error, 'Failed to update status.');
  }
};

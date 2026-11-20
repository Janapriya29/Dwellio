import { Request, Response } from 'express';
import { ApiResponse, ProviderProfileData, UpdateProviderProfilePayload } from '@dwellio/shared';
import { ProviderProfile } from '../models/ProviderProfile';
import { toProviderProfileData } from '../utils/provider';
import { sendInternalError } from '../utils/security';

const PHONE_REGEX = /^[+]?[0-9\s-]{7,15}$/;

/**
 * Provider: Get current approved provider profile
 * GET /api/provider/profile
 */
export const getMyProviderProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider profile required.' });
      return;
    }

    const response: ApiResponse<ProviderProfileData> = {
      success: true,
      message: 'Provider profile retrieved successfully.',
      data: toProviderProfileData(req.providerProfile),
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'ProviderProfile.getMyProviderProfile', error, 'Failed to retrieve provider profile.');
  }
};

/**
 * Provider: Update current approved provider profile
 * PATCH /api/provider/profile
 */
export const updateMyProviderProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider profile required.' });
      return;
    }

    const payload: UpdateProviderProfilePayload = req.body || {};

    // Strictly forbid attempts to escalate role, verificationStatus, or administrative fields
    const forbiddenKeys = [
      'verificationStatus',
      'userId',
      '_id',
      'id',
      'ratingAverage',
      'reviewCount',
      'ratingVersion',
      'reviewedBy',
      'reviewedAt',
      'rejectionReason',
      'role',
    ];

    for (const key of forbiddenKeys) {
      if (key in req.body) {
        res.status(400).json({
          success: false,
          message: `Field '${key}' cannot be modified through the provider profile endpoint.`,
        });
        return;
      }
    }

    const profile = req.providerProfile;

    // Validate and apply displayName
    if (payload.displayName !== undefined) {
      if (
        typeof payload.displayName !== 'string' ||
        payload.displayName.trim().length < 2 ||
        payload.displayName.trim().length > 100
      ) {
        res.status(400).json({
          success: false,
          message: 'Display name must be between 2 and 100 characters.',
        });
        return;
      }
      profile.displayName = payload.displayName.trim();
    }

    // Validate and apply phone
    if (payload.phone !== undefined) {
      if (typeof payload.phone !== 'string' || !PHONE_REGEX.test(payload.phone.trim())) {
        res.status(400).json({
          success: false,
          message: 'Please provide a valid contact phone number (7 to 15 digits).',
        });
        return;
      }
      profile.phone = payload.phone.trim();
    }

    // Validate and apply bio
    if (payload.bio !== undefined) {
      if (typeof payload.bio !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Bio must be a string.',
        });
        return;
      }
      if (payload.bio.trim().length > 1000) {
        res.status(400).json({
          success: false,
          message: 'Bio cannot exceed 1,000 characters.',
        });
        return;
      }
      profile.bio = payload.bio.trim();
    }

    // Validate and apply experienceYears
    if (payload.experienceYears !== undefined) {
      if (
        typeof payload.experienceYears !== 'number' ||
        !Number.isInteger(payload.experienceYears) ||
        payload.experienceYears < 0 ||
        payload.experienceYears > 60
      ) {
        res.status(400).json({
          success: false,
          message: 'Experience must be an integer between 0 and 60 years.',
        });
        return;
      }
      profile.experienceYears = payload.experienceYears;
    }

    // Validate and apply serviceArea
    if (payload.serviceArea !== undefined) {
      if (
        typeof payload.serviceArea !== 'string' ||
        payload.serviceArea.trim().length < 2 ||
        payload.serviceArea.trim().length > 150
      ) {
        res.status(400).json({
          success: false,
          message: 'Service area must be described in 2 to 150 characters.',
        });
        return;
      }
      profile.serviceArea = payload.serviceArea.trim();
    }

    // Validate and apply businessAddress
    if (payload.businessAddress !== undefined) {
      if (typeof payload.businessAddress !== 'string' || payload.businessAddress.trim().length > 200) {
        res.status(400).json({
          success: false,
          message: 'Business address cannot exceed 200 characters.',
        });
        return;
      }
      profile.businessAddress = payload.businessAddress.trim();
    }

    // Validate and apply city
    if (payload.city !== undefined) {
      if (typeof payload.city !== 'string' || payload.city.trim().length > 100) {
        res.status(400).json({
          success: false,
          message: 'City cannot exceed 100 characters.',
        });
        return;
      }
      profile.city = payload.city.trim();
    }

    // Validate and apply skills
    if (payload.skills !== undefined) {
      if (!Array.isArray(payload.skills)) {
        res.status(400).json({
          success: false,
          message: 'Skills must be an array of strings.',
        });
        return;
      }
      const uniqueSkills = Array.from(
        new Set(
          payload.skills
            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
            .map((s) => s.trim().slice(0, 50))
        )
      );
      profile.skills = uniqueSkills;
    }

    // Validate and apply avatarUrl
    if (payload.avatarUrl !== undefined) {
      if (typeof payload.avatarUrl !== 'string' || payload.avatarUrl.trim().length > 500) {
        res.status(400).json({
          success: false,
          message: 'Avatar URL cannot exceed 500 characters.',
        });
        return;
      }
      const cleanUrl = payload.avatarUrl.trim();
      if (cleanUrl.length > 0 && !/^https?:\/\/.+/.test(cleanUrl)) {
        res.status(400).json({
          success: false,
          message: 'Avatar URL must start with http:// or https://.',
        });
        return;
      }
      profile.avatarUrl = cleanUrl || undefined;
    }

    await profile.save();

    const response: ApiResponse<ProviderProfileData> = {
      success: true,
      message: 'Provider profile updated successfully.',
      data: toProviderProfileData(profile),
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'ProviderProfile.updateMyProviderProfile', error, 'Failed to update provider profile.');
  }
};

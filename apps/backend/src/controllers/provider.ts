import { Request, Response } from 'express';
import { ApiResponse, ProviderProfileData } from '@dwellio/shared';
import { ProviderProfile } from '../models/ProviderProfile';
import { toProviderProfileData } from '../utils/provider';

const PHONE_REGEX = /^[+]?[0-9\s-]{7,15}$/;

/**
 * Submit or Resubmit a Provider Application
 * POST /api/providers/apply
 */
export const applyProvider = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    const response: ApiResponse = {
      success: false,
      message: 'Authentication required to apply as a service provider.',
    };
    res.status(401).json(response);
    return;
  }

  const { displayName, phone, serviceArea, skills } = req.body;

  // 1. Input Validation
  if (!displayName || typeof displayName !== 'string' || displayName.trim().length < 2 || displayName.trim().length > 100) {
    const response: ApiResponse = {
      success: false,
      message: 'Display name must be between 2 and 100 characters.',
    };
    res.status(400).json(response);
    return;
  }

  if (!phone || typeof phone !== 'string' || !PHONE_REGEX.test(phone.trim())) {
    const response: ApiResponse = {
      success: false,
      message: 'Please provide a valid contact phone number (7 to 15 digits).',
    };
    res.status(400).json(response);
    return;
  }

  if (!serviceArea || typeof serviceArea !== 'string' || serviceArea.trim().length < 2 || serviceArea.trim().length > 150) {
    const response: ApiResponse = {
      success: false,
      message: 'Service area must be described in 2 to 150 characters.',
    };
    res.status(400).json(response);
    return;
  }

  let cleanSkills: string[] = [];
  if (skills !== undefined) {
    if (!Array.isArray(skills)) {
      const response: ApiResponse = {
        success: false,
        message: 'Skills must be an array of strings.',
      };
      res.status(400).json(response);
      return;
    }
    cleanSkills = skills
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.trim());
  }

  // 2. Check for existing profile for this user
  const existingProfile = await ProviderProfile.findOne({ userId: req.user._id });

  if (existingProfile) {
    // If pending, cannot create another duplicate
    if (existingProfile.verificationStatus === 'pending') {
      const response: ApiResponse<{ application: ProviderProfileData }> = {
        success: false,
        message: 'You already have a pending provider application under review.',
        data: {
          application: toProviderProfileData(existingProfile),
        },
      };
      res.status(409).json(response);
      return;
    }

    // If already approved, reject reapplication
    if (existingProfile.verificationStatus === 'approved') {
      const response: ApiResponse<{ application: ProviderProfileData }> = {
        success: false,
        message: 'You are already an approved service provider on Dwellio.',
        data: {
          application: toProviderProfileData(existingProfile),
        },
      };
      res.status(409).json(response);
      return;
    }

    // If rejected: allow resubmission with updated information
    if (existingProfile.verificationStatus === 'rejected') {
      existingProfile.displayName = displayName.trim();
      existingProfile.phone = phone.trim();
      existingProfile.serviceArea = serviceArea.trim();
      existingProfile.skills = cleanSkills;
      existingProfile.verificationStatus = 'pending'; // Reset status to pending
      existingProfile.rejectionReason = undefined;   // Clear past rejection reason
      existingProfile.reviewedBy = undefined;
      existingProfile.reviewedAt = undefined;

      await existingProfile.save();

      const response: ApiResponse<{ application: ProviderProfileData }> = {
        success: true,
        message: 'Provider application resubmitted successfully and is pending administrator review.',
        data: {
          application: toProviderProfileData(existingProfile),
        },
      };
      res.status(200).json(response);
      return;
    }
  }

  // 3. New Application: Always forced to 'pending'
  const newProfile = new ProviderProfile({
    userId: req.user._id,
    displayName: displayName.trim(),
    phone: phone.trim(),
    serviceArea: serviceArea.trim(),
    skills: cleanSkills,
    verificationStatus: 'pending', // Client cannot override verification status
  });

  await newProfile.save();

  const response: ApiResponse<{ application: ProviderProfileData }> = {
    success: true,
    message: 'Provider application submitted successfully and is pending administrator review.',
    data: {
      application: toProviderProfileData(newProfile),
    },
  };

  res.status(201).json(response);
};

/**
 * Retrieve Current User's Provider Application Status
 * GET /api/providers/application-status
 */
export const getApplicationStatus = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    const response: ApiResponse = {
      success: false,
      message: 'Authentication required.',
    };
    res.status(401).json(response);
    return;
  }

  const profile = await ProviderProfile.findOne({ userId: req.user._id });

  if (!profile) {
    const response: ApiResponse = {
      success: false,
      message: 'No provider application found for this account.',
    };
    res.status(404).json(response);
    return;
  }

  const response: ApiResponse<{ application: ProviderProfileData }> = {
    success: true,
    message: 'Provider application status retrieved successfully.',
    data: {
      application: toProviderProfileData(profile),
    },
  };

  res.status(200).json(response);
};

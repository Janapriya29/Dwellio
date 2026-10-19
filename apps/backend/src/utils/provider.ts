import { ProviderProfileData } from '@dwellio/shared';
import { IProviderProfile } from '../models/ProviderProfile';

/**
 * Format a ProviderProfile document into a clean, safe DTO.
 */
export const toProviderProfileData = (profile: IProviderProfile): ProviderProfileData => {
  return {
    id: profile._id.toString(),
    userId: profile.userId.toString(),
    displayName: profile.displayName,
    phone: profile.phone,
    serviceArea: profile.serviceArea,
    skills: profile.skills || [],
    verificationStatus: profile.verificationStatus,
    rejectionReason: profile.rejectionReason,
    createdAt: profile.createdAt ? profile.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: profile.updatedAt ? profile.updatedAt.toISOString() : new Date().toISOString(),
  };
};

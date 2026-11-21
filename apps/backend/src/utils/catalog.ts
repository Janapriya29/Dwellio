import { CategoryData, ServiceData, PublicProviderData } from '@dwellio/shared';
import { ICategory } from '../models/Category';
import { IService } from '../models/Service';
import { IProviderProfile } from '../models/ProviderProfile';

export const toCategoryData = (cat: ICategory): CategoryData => {
  return {
    id: cat._id.toString(),
    name: cat.name,
    slug: cat.slug,
    description: cat.description,
    icon: cat.icon,
    rooms: cat.rooms || [],
    isActive: cat.isActive,
    createdAt: cat.createdAt ? cat.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: cat.updatedAt ? cat.updatedAt.toISOString() : new Date().toISOString(),
  };
};

export const toServiceData = (svc: IService): ServiceData => {
  return {
    id: svc._id.toString(),
    categoryId: svc.categoryId.toString(),
    name: svc.name,
    slug: svc.slug,
    description: svc.description,
    icon: svc.icon,
    basePrice: svc.basePrice,
    isActive: svc.isActive,
    createdAt: svc.createdAt ? svc.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: svc.updatedAt ? svc.updatedAt.toISOString() : new Date().toISOString(),
  };
};

export const toPublicProviderData = (profile: IProviderProfile): PublicProviderData => {
  const userDoc: any = profile.userId;
  return {
    id: profile._id.toString(),
    userId: userDoc && userDoc._id ? userDoc._id.toString() : profile.userId.toString(),
    displayName: profile.displayName,
    phone: profile.phone,
    serviceArea: profile.serviceArea,
    skills: profile.skills || [],
    verificationStatus: profile.verificationStatus,
    ratingAverage: profile.ratingAverage ?? 0,
    reviewCount: profile.reviewCount ?? 0,
    user: userDoc && userDoc._id
      ? {
          name: userDoc.name,
          email: userDoc.email,
        }
      : undefined,
    createdAt: profile.createdAt ? profile.createdAt.toISOString() : new Date().toISOString(),
  };
};

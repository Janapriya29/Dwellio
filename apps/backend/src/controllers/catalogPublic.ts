import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ApiResponse, CategoryData, ServiceData, PublicProviderData } from '@dwellio/shared';
import { Category } from '../models/Category';
import { Service } from '../models/Service';
import { ProviderProfile } from '../models/ProviderProfile';
import { User } from '../models/User';
import { toCategoryData, toServiceData, toPublicProviderData } from '../utils/catalog';

/**
 * Public: Get active service categories
 * Optional query: ?room=kitchen|bath|living|roof|garden
 * GET /api/catalog/categories
 */
export const getPublicCategories = async (req: Request, res: Response): Promise<void> => {
  const { room } = req.query;
  const filter: Record<string, unknown> = { isActive: true };

  if (room && typeof room === 'string') {
    filter.rooms = room.trim().toLowerCase();
  }

  const categories = await Category.find(filter).sort({ name: 1 });
  const data: CategoryData[] = categories.map(toCategoryData);

  res.status(200).json({
    success: true,
    message: 'Active categories retrieved.',
    data,
  });
};

/**
 * Public: Get active services
 * Optional query: ?categoryId=... or ?categorySlug=...
 * GET /api/catalog/services
 */
export const getPublicServices = async (req: Request, res: Response): Promise<void> => {
  const { categoryId, categorySlug } = req.query;
  const filter: Record<string, unknown> = { isActive: true };

  if (categoryId) {
    if (typeof categoryId !== 'string' || !mongoose.Types.ObjectId.isValid(categoryId)) {
      res.status(400).json({ success: false, message: 'Invalid categoryId.' });
      return;
    }
    filter.categoryId = categoryId;
  } else if (categorySlug && typeof categorySlug === 'string') {
    const category = await Category.findOne({ slug: categorySlug.trim().toLowerCase(), isActive: true });
    if (!category) {
      res.status(200).json({ success: true, message: 'No services found.', data: [] });
      return;
    }
    filter.categoryId = category._id;
  }

  const services = await Service.find(filter).sort({ name: 1 });
  const data: ServiceData[] = services.map(toServiceData);

  res.status(200).json({
    success: true,
    message: 'Active services retrieved.',
    data,
  });
};

/**
 * Public: Discover approved service providers
 * Query params: ?room=... & ?serviceArea=... & ?skill=...
 * GET /api/catalog/providers
 */
export const getPublicProviders = async (req: Request, res: Response): Promise<void> => {
  const { room, serviceArea, skill } = req.query;

  // 1. Base query: strictly approved verificationStatus
  const profileFilter: Record<string, unknown> = {
    verificationStatus: 'approved',
  };

  if (serviceArea && typeof serviceArea === 'string' && serviceArea.trim().length > 0) {
    profileFilter.serviceArea = { $regex: new RegExp(serviceArea.trim(), 'i') };
  }

  // 2. Room or Skill matching
  if (room && typeof room === 'string') {
    const cleanRoom = room.trim().toLowerCase();
    // Find active categories associated with this room
    const matchingCategories = await Category.find({ rooms: cleanRoom, isActive: true });
    const categoryIds = matchingCategories.map((c) => c._id);
    const categoryNames = matchingCategories.map((c) => c.name);

    // Also look up services under those categories
    const services = await Service.find({ categoryId: { $in: categoryIds }, isActive: true });
    const serviceNames = services.map((s) => s.name);

    const relevantTerms = [...categoryNames, ...serviceNames];

    // Providers match if explicitly assigned to category OR have relevant skills
    if (relevantTerms.length > 0) {
      profileFilter.$or = [
        { categories: { $in: categoryIds } },
        { skills: { $in: relevantTerms.map((t) => new RegExp(t, 'i')) } },
      ];
    }
  } else if (skill && typeof skill === 'string' && skill.trim().length > 0) {
    profileFilter.skills = { $regex: new RegExp(skill.trim(), 'i') };
  }

  // 3. Find profiles and populate user details
  const rawProfiles = await ProviderProfile.find(profileFilter)
    .populate({
      path: 'userId',
      select: 'name email role isActive',
      match: { isActive: true }, // Ensure associated user is active
    })
    .sort({ createdAt: -1 });

  // Filter out any profiles whose user was deactivated or missing
  const activeProfiles = rawProfiles.filter((p) => p.userId !== null && p.userId !== undefined);

  const data: PublicProviderData[] = activeProfiles.map(toPublicProviderData);

  res.status(200).json({
    success: true,
    message: 'Approved service providers retrieved.',
    data,
  });
};

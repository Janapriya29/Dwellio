import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ApiResponse, CategoryData, ServiceData, PublicProviderData } from '@dwellio/shared';
import { Category } from '../models/Category';
import { Service } from '../models/Service';
import { ProviderProfile } from '../models/ProviderProfile';
import { User } from '../models/User';
import { toCategoryData, toServiceData, toPublicProviderData } from '../utils/catalog';
import { escapeRegex } from '../utils/security';

/**
 * Public: Get active service categories
 * Optional query: ?room=kitchen|bath|living|roof|garden
 * GET /api/catalog/categories
 */
export const getPublicCategories = async (req: Request, res: Response): Promise<void> => {
  const { room } = req.query;
  const filter: Record<string, unknown> = { isActive: true };

  if (room !== undefined) {
    if (typeof room !== 'string') {
      res.status(400).json({ success: false, message: 'Invalid room query parameter. Expected a string.' });
      return;
    }
    const cleanRoom = room.trim().toLowerCase();
    if (cleanRoom.length > 50) {
      res.status(400).json({ success: false, message: "Query parameter 'room' exceeds maximum allowed length of 50 characters." });
      return;
    }
    if (cleanRoom.length > 0) {
      filter.rooms = cleanRoom;
    }
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

  if (categoryId !== undefined) {
    if (typeof categoryId !== 'string' || !mongoose.Types.ObjectId.isValid(categoryId)) {
      res.status(400).json({ success: false, message: 'Invalid categoryId.' });
      return;
    }
    filter.categoryId = categoryId;
  } else if (categorySlug !== undefined) {
    if (typeof categorySlug !== 'string') {
      res.status(400).json({ success: false, message: 'Invalid categorySlug query parameter. Expected a string.' });
      return;
    }
    const cleanSlug = categorySlug.trim().toLowerCase();
    if (cleanSlug.length > 100) {
      res.status(400).json({ success: false, message: "Query parameter 'categorySlug' exceeds maximum allowed length of 100 characters." });
      return;
    }
    const category = await Category.findOne({ slug: cleanSlug, isActive: true });
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

  // Validate query parameter types and lengths
  if (serviceArea !== undefined) {
    if (typeof serviceArea !== 'string') {
      res.status(400).json({ success: false, message: 'Invalid serviceArea query parameter. Expected a string.' });
      return;
    }
    if (serviceArea.trim().length > 100) {
      res.status(400).json({ success: false, message: "Query parameter 'serviceArea' exceeds maximum allowed length of 100 characters." });
      return;
    }
  }

  if (skill !== undefined) {
    if (typeof skill !== 'string') {
      res.status(400).json({ success: false, message: 'Invalid skill query parameter. Expected a string.' });
      return;
    }
    if (skill.trim().length > 100) {
      res.status(400).json({ success: false, message: "Query parameter 'skill' exceeds maximum allowed length of 100 characters." });
      return;
    }
  }

  if (room !== undefined) {
    if (typeof room !== 'string') {
      res.status(400).json({ success: false, message: 'Invalid room query parameter. Expected a string.' });
      return;
    }
    if (room.trim().length > 50) {
      res.status(400).json({ success: false, message: "Query parameter 'room' exceeds maximum allowed length of 50 characters." });
      return;
    }
  }

  // 1. Base query: strictly approved verificationStatus
  const profileFilter: Record<string, unknown> = {
    verificationStatus: 'approved',
  };

  if (serviceArea && typeof serviceArea === 'string' && serviceArea.trim().length > 0) {
    const escapedArea = escapeRegex(serviceArea.trim());
    profileFilter.serviceArea = { $regex: new RegExp(escapedArea, 'i') };
  }

  // 2. Room or Skill matching
  if (room && typeof room === 'string' && room.trim().length > 0) {
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
        { skills: { $in: relevantTerms.map((t) => new RegExp(escapeRegex(t), 'i')) } },
      ];
    }
  } else if (skill && typeof skill === 'string' && skill.trim().length > 0) {
    const escapedSkill = escapeRegex(skill.trim());
    profileFilter.skills = { $regex: new RegExp(escapedSkill, 'i') };
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

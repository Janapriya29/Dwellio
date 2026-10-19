import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ApiResponse, CategoryData, ServiceData } from '@dwellio/shared';
import { Category } from '../models/Category';
import { Service } from '../models/Service';
import { AuditLog } from '../models/AuditLog';
import { toCategoryData, toServiceData } from '../utils/catalog';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * List all categories (Admin)
 * GET /api/admin/catalog/categories
 */
export const listAdminCategories = async (_req: Request, res: Response): Promise<void> => {
  const categories = await Category.find().sort({ name: 1 });
  const data: CategoryData[] = categories.map(toCategoryData);

  const response: ApiResponse<CategoryData[]> = {
    success: true,
    message: 'Categories retrieved successfully.',
    data,
  };
  res.status(200).json(response);
};

/**
 * Create a new service category (Admin)
 * POST /api/admin/catalog/categories
 */
export const createCategory = async (req: Request, res: Response): Promise<void> => {
  const { name, slug, description, icon, rooms, isActive } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    res.status(400).json({
      success: false,
      message: 'Category name must be between 2 and 100 characters.',
    });
    return;
  }

  const normalizedSlug = (slug || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))
    .trim()
    .toLowerCase();

  if (!SLUG_REGEX.test(normalizedSlug)) {
    res.status(400).json({
      success: false,
      message: 'Slug must be lowercase alphanumeric with hyphens (e.g., "plumbing-services").',
    });
    return;
  }

  const existingSlug = await Category.findOne({ slug: normalizedSlug });
  if (existingSlug) {
    res.status(409).json({
      success: false,
      message: `A category with slug "${normalizedSlug}" already exists.`,
    });
    return;
  }

  let cleanRooms: string[] = [];
  if (rooms && Array.isArray(rooms)) {
    cleanRooms = rooms
      .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      .map((r) => r.trim().toLowerCase());
  }

  const newCategory = new Category({
    name: name.trim(),
    slug: normalizedSlug,
    description: typeof description === 'string' ? description.trim() : undefined,
    icon: typeof icon === 'string' ? icon.trim() : 'wrench',
    rooms: cleanRooms,
    isActive: isActive !== undefined ? Boolean(isActive) : true,
  });

  await newCategory.save();

  if (req.user) {
    await new AuditLog({
      adminId: req.user._id,
      action: 'CATEGORY_CREATED',
      targetId: newCategory._id,
      targetType: 'Category',
      details: {
        name: newCategory.name,
        slug: newCategory.slug,
        rooms: newCategory.rooms,
      },
    }).save().catch(() => {});
  }

  res.status(201).json({
    success: true,
    message: 'Category created successfully.',
    data: toCategoryData(newCategory),
  });
};

/**
 * Update a category (Admin)
 * PATCH /api/admin/catalog/categories/:id
 */
export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, message: 'Invalid category ID format.' });
    return;
  }

  const category = await Category.findById(id);
  if (!category) {
    res.status(404).json({ success: false, message: 'Category not found.' });
    return;
  }

  const { name, description, icon, rooms } = req.body;

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      res.status(400).json({ success: false, message: 'Name must be between 2 and 100 characters.' });
      return;
    }
    category.name = name.trim();
  }

  if (description !== undefined) {
    category.description = typeof description === 'string' ? description.trim() : undefined;
  }

  if (icon !== undefined) {
    category.icon = typeof icon === 'string' ? icon.trim() : category.icon;
  }

  if (rooms !== undefined) {
    if (!Array.isArray(rooms)) {
      res.status(400).json({ success: false, message: 'Rooms must be an array of strings.' });
      return;
    }
    category.rooms = rooms
      .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      .map((r) => r.trim().toLowerCase());
  }

  await category.save();

  if (req.user) {
    await new AuditLog({
      adminId: req.user._id,
      action: 'CATEGORY_UPDATED',
      targetId: category._id,
      targetType: 'Category',
      details: {
        name: category.name,
        slug: category.slug,
        rooms: category.rooms,
      },
    }).save().catch(() => {});
  }

  res.status(200).json({
    success: true,
    message: 'Category updated successfully.',
    data: toCategoryData(category),
  });
};

/**
 * Deactivate or Reactivate Category (Admin)
 * PATCH /api/admin/catalog/categories/:id/status
 */
export const setCategoryStatus = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { isActive } = req.body;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, message: 'Invalid category ID format.' });
    return;
  }

  if (isActive === undefined || typeof isActive !== 'boolean') {
    res.status(400).json({ success: false, message: 'isActive boolean is required.' });
    return;
  }

  const category = await Category.findById(id);
  if (!category) {
    res.status(404).json({ success: false, message: 'Category not found.' });
    return;
  }

  category.isActive = isActive;
  await category.save();

  if (req.user) {
    await new AuditLog({
      adminId: req.user._id,
      action: 'CATEGORY_STATUS_CHANGED',
      targetId: category._id,
      targetType: 'Category',
      details: {
        name: category.name,
        isActive,
      },
    }).save().catch(() => {});
  }

  res.status(200).json({
    success: true,
    message: `Category ${isActive ? 'activated' : 'deactivated'} successfully.`,
    data: toCategoryData(category),
  });
};

/**
 * List all services (Admin)
 * GET /api/admin/catalog/services
 */
export const listAdminServices = async (req: Request, res: Response): Promise<void> => {
  const { categoryId } = req.query;
  const filter: Record<string, unknown> = {};

  if (categoryId) {
    if (typeof categoryId !== 'string' || !mongoose.Types.ObjectId.isValid(categoryId)) {
      res.status(400).json({ success: false, message: 'Invalid categoryId filter.' });
      return;
    }
    filter.categoryId = categoryId;
  }

  const services = await Service.find(filter).sort({ name: 1 });
  const data: ServiceData[] = services.map(toServiceData);

  res.status(200).json({
    success: true,
    message: 'Services retrieved successfully.',
    data,
  });
};

/**
 * Create a new service under a category (Admin)
 * POST /api/admin/catalog/services
 */
export const createService = async (req: Request, res: Response): Promise<void> => {
  const { categoryId, name, slug, description, icon, isActive } = req.body;

  if (!categoryId || !mongoose.Types.ObjectId.isValid(categoryId)) {
    res.status(400).json({ success: false, message: 'A valid categoryId is required.' });
    return;
  }

  const categoryExists = await Category.findById(categoryId);
  if (!categoryExists) {
    res.status(404).json({ success: false, message: 'Referenced category does not exist.' });
    return;
  }

  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    res.status(400).json({ success: false, message: 'Service name must be between 2 and 100 characters.' });
    return;
  }

  const normalizedSlug = (slug || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))
    .trim()
    .toLowerCase();

  if (!SLUG_REGEX.test(normalizedSlug)) {
    res.status(400).json({
      success: false,
      message: 'Slug must be lowercase alphanumeric with hyphens.',
    });
    return;
  }

  const existingSlug = await Service.findOne({ slug: normalizedSlug });
  if (existingSlug) {
    res.status(409).json({
      success: false,
      message: `A service with slug "${normalizedSlug}" already exists.`,
    });
    return;
  }

  const newService = new Service({
    categoryId,
    name: name.trim(),
    slug: normalizedSlug,
    description: typeof description === 'string' ? description.trim() : undefined,
    icon: typeof icon === 'string' ? icon.trim() : undefined,
    isActive: isActive !== undefined ? Boolean(isActive) : true,
  });

  await newService.save();

  if (req.user) {
    await new AuditLog({
      adminId: req.user._id,
      action: 'SERVICE_CREATED',
      targetId: newService._id,
      targetType: 'Service',
      details: {
        categoryId: newService.categoryId,
        name: newService.name,
        slug: newService.slug,
      },
    }).save().catch(() => {});
  }

  res.status(201).json({
    success: true,
    message: 'Service created successfully.',
    data: toServiceData(newService),
  });
};

/**
 * Update a service (Admin)
 * PATCH /api/admin/catalog/services/:id
 */
export const updateService = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, message: 'Invalid service ID format.' });
    return;
  }

  const service = await Service.findById(id);
  if (!service) {
    res.status(404).json({ success: false, message: 'Service not found.' });
    return;
  }

  const { name, description, icon } = req.body;

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      res.status(400).json({ success: false, message: 'Name must be between 2 and 100 characters.' });
      return;
    }
    service.name = name.trim();
  }

  if (description !== undefined) {
    service.description = typeof description === 'string' ? description.trim() : undefined;
  }

  if (icon !== undefined) {
    service.icon = typeof icon === 'string' ? icon.trim() : service.icon;
  }

  await service.save();

  if (req.user) {
    await new AuditLog({
      adminId: req.user._id,
      action: 'SERVICE_UPDATED',
      targetId: service._id,
      targetType: 'Service',
      details: {
        categoryId: service.categoryId,
        name: service.name,
        slug: service.slug,
      },
    }).save().catch(() => {});
  }

  res.status(200).json({
    success: true,
    message: 'Service updated successfully.',
    data: toServiceData(service),
  });
};

/**
 * Deactivate or Reactivate Service (Admin)
 * PATCH /api/admin/catalog/services/:id/status
 */
export const setServiceStatus = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { isActive } = req.body;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, message: 'Invalid service ID format.' });
    return;
  }

  if (isActive === undefined || typeof isActive !== 'boolean') {
    res.status(400).json({ success: false, message: 'isActive boolean is required.' });
    return;
  }

  const service = await Service.findById(id);
  if (!service) {
    res.status(404).json({ success: false, message: 'Service not found.' });
    return;
  }

  service.isActive = isActive;
  await service.save();

  if (req.user) {
    await new AuditLog({
      adminId: req.user._id,
      action: 'SERVICE_STATUS_CHANGED',
      targetId: service._id,
      targetType: 'Service',
      details: {
        name: service.name,
        isActive,
      },
    }).save().catch(() => {});
  }

  res.status(200).json({
    success: true,
    message: `Service ${isActive ? 'activated' : 'deactivated'} successfully.`,
    data: toServiceData(service),
  });
};

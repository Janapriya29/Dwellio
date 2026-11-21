import React, { useState, useEffect, useCallback } from 'react';
import { CategoryData, ServiceData, HouseRoom } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import {
  fetchAdminCategories,
  createAdminCategory,
  updateAdminCategory,
  setAdminCategoryStatus,
  fetchAdminServices,
  createAdminService,
  updateAdminService,
  setAdminServiceStatus,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateServiceInput,
  UpdateServiceInput,
} from '../../services/adminService';

const AVAILABLE_ROOMS: { id: HouseRoom; label: string }[] = [
  { id: 'roof', label: 'Roof & Solar' },
  { id: 'bath', label: 'Bathroom & Plumbing' },
  { id: 'living', label: 'Living Room' },
  { id: 'kitchen', label: 'Kitchen & Dining' },
  { id: 'garden', label: 'Garden & Outdoor' },
];

export const AdminCatalogView: React.FC = () => {
  const { token } = useAuth();
  const [subTab, setSubTab] = useState<'categories' | 'services'>('categories');

  // Categories state
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [isCatLoading, setIsCatLoading] = useState<boolean>(true);
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>('all');

  // Services state
  const [services, setServices] = useState<ServiceData[]>([]);
  const [isSvcLoading, setIsSvcLoading] = useState<boolean>(true);

  // Common alerts
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Category Modals
  const [isAddCatModalOpen, setIsAddCatModalOpen] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<CategoryData | null>(null);
  const [catFormData, setCatFormData] = useState<CreateCategoryInput>({
    name: '',
    slug: '',
    description: '',
    icon: '🛠️',
    rooms: [],
  });

  // Service Modals
  const [isAddSvcModalOpen, setIsAddSvcModalOpen] = useState<boolean>(false);
  const [editingService, setEditingService] = useState<ServiceData | null>(null);
  const [svcFormData, setSvcFormData] = useState<CreateServiceInput>({
    categoryId: '',
    name: '',
    slug: '',
    description: '',
    icon: '🔧',
    basePrice: 499,
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Load Categories
  const loadCategories = useCallback(async () => {
    if (!token) return;
    setIsCatLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchAdminCategories(token);
      setCategories(data);
      if (data.length > 0 && !svcFormData.categoryId) {
        setSvcFormData((prev) => ({ ...prev, categoryId: data[0].id }));
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load categories.');
    } finally {
      setIsCatLoading(false);
    }
  }, [token, svcFormData.categoryId]);

  // Load Services
  const loadServices = useCallback(async () => {
    if (!token) return;
    setIsSvcLoading(true);
    setErrorMessage(null);
    try {
      const catId = selectedCatFilter === 'all' ? undefined : selectedCatFilter;
      const data = await fetchAdminServices(token, catId);
      setServices(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load services.');
    } finally {
      setIsSvcLoading(false);
    }
  }, [token, selectedCatFilter]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // ---------------- Category Handlers ----------------
  const handleOpenAddCategory = () => {
    setCatFormData({
      name: '',
      slug: '',
      description: '',
      icon: '🛠️',
      rooms: ['living'],
    });
    setModalError(null);
    setIsAddCatModalOpen(true);
  };

  const handleOpenEditCategory = (cat: CategoryData) => {
    setEditingCategory(cat);
    setCatFormData({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      icon: cat.icon || '🛠️',
      rooms: cat.rooms,
    });
    setModalError(null);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!catFormData.name.trim()) {
      setModalError('Category name is required.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);
    try {
      if (editingCategory) {
        const updatePayload: UpdateCategoryInput = {
          name: catFormData.name.trim(),
          description: catFormData.description?.trim(),
          icon: catFormData.icon?.trim(),
          rooms: catFormData.rooms,
        };
        await updateAdminCategory(token, editingCategory.id, updatePayload);
        setFeedbackMessage(`Updated category "${catFormData.name}".`);
        setEditingCategory(null);
      } else {
        await createAdminCategory(token, catFormData);
        setFeedbackMessage(`Created new category "${catFormData.name}".`);
        setIsAddCatModalOpen(false);
      }
      await loadCategories();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save category.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleCategoryStatus = async (cat: CategoryData) => {
    if (!token) return;
    try {
      const updated = await setAdminCategoryStatus(token, cat.id, !cat.isActive);
      setFeedbackMessage(
        `Category "${updated.name}" is now ${updated.isActive ? 'Active' : 'Inactive'}.`
      );
      await loadCategories();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update category status.');
    }
  };

  // ---------------- Service Handlers ----------------
  const handleOpenAddService = () => {
    setSvcFormData({
      categoryId: categories[0]?.id || '',
      name: '',
      slug: '',
      description: '',
      icon: '🔧',
      basePrice: 499,
    });
    setModalError(null);
    setIsAddSvcModalOpen(true);
  };

  const handleOpenEditService = (svc: ServiceData) => {
    setEditingService(svc);
    setSvcFormData({
      categoryId: svc.categoryId,
      name: svc.name,
      slug: svc.slug,
      description: svc.description || '',
      icon: svc.icon || '🔧',
      basePrice: svc.basePrice ?? 499,
    });
    setModalError(null);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!svcFormData.name.trim()) {
      setModalError('Service name is required.');
      return;
    }
    if (!svcFormData.categoryId) {
      setModalError('Category selection is required.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);
    try {
      if (editingService) {
        const updatePayload: UpdateServiceInput = {
          name: svcFormData.name.trim(),
          categoryId: svcFormData.categoryId,
          description: svcFormData.description?.trim(),
          icon: svcFormData.icon?.trim(),
          basePrice: svcFormData.basePrice !== undefined ? Number(svcFormData.basePrice) : undefined,
        };
        await updateAdminService(token, editingService.id, updatePayload);
        setFeedbackMessage(`Updated service "${svcFormData.name}".`);
        setEditingService(null);
      } else {
        await createAdminService(token, {
          ...svcFormData,
          basePrice: svcFormData.basePrice !== undefined ? Number(svcFormData.basePrice) : 499,
        });
        setFeedbackMessage(`Created new service "${svcFormData.name}".`);
        setIsAddSvcModalOpen(false);
      }
      await loadServices();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save service.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleServiceStatus = async (svc: ServiceData) => {
    if (!token) return;
    try {
      const updated = await setAdminServiceStatus(token, svc.id, !svc.isActive);
      setFeedbackMessage(
        `Service "${updated.name}" is now ${updated.isActive ? 'Active' : 'Inactive'}.`
      );
      await loadServices();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update service status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-dwellio-teal">Service Catalog Management</h2>
          <p className="text-xs text-dwellio-teal/70">
            Define categories, configure house cutaway rooms, and manage service offerings.
          </p>
        </div>

        {/* Sub-Tabs: Categories vs Services */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-dwellio-mint/50">
            <button
              type="button"
              onClick={() => setSubTab('categories')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                subTab === 'categories'
                  ? 'bg-dwellio-teal text-white shadow-xs'
                  : 'text-dwellio-teal/70 hover:text-dwellio-teal'
              }`}
            >
              <span>📁</span>
              <span>Categories ({categories.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('services')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                subTab === 'services'
                  ? 'bg-dwellio-teal text-white shadow-xs'
                  : 'text-dwellio-teal/70 hover:text-dwellio-teal'
              }`}
            >
              <span>⚙️</span>
              <span>Services ({services.length})</span>
            </button>
          </div>

          {subTab === 'categories' ? (
            <button
              type="button"
              onClick={handleOpenAddCategory}
              className="px-3.5 py-2 bg-dwellio-teal hover:bg-dwellio-teal/90 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
            >
              <span>+</span>
              <span>New Category</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenAddService}
              className="px-3.5 py-2 bg-dwellio-teal hover:bg-dwellio-teal/90 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
            >
              <span>+</span>
              <span>New Service</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Messages */}
      {feedbackMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-xs text-emerald-900">
          <span>{feedbackMessage}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="font-bold hover:underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
          {errorMessage}
        </div>
      )}

      {/* ----------------- Sub-Tab 1: Categories ----------------- */}
      {subTab === 'categories' && (
        <div>
          {isCatLoading ? (
            <div className="py-16 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-dwellio-teal border-t-transparent mb-3" />
              <p className="text-sm font-semibold text-dwellio-teal/70">Loading categories...</p>
            </div>
          ) : categories.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-dwellio-mint/40">
              <p className="text-sm font-bold text-dwellio-teal">No categories found</p>
              <p className="text-xs text-dwellio-teal/60 mt-1">Get started by creating your first service category.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-dwellio-mint/40 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-dwellio-teal">
                  <thead className="bg-dwellio-ivory/50 border-b border-dwellio-mint/30 font-bold">
                    <tr>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Slug</th>
                      <th className="py-3 px-4">Cutaway Rooms</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dwellio-mint/20">
                    {categories.map((cat) => (
                      <tr key={cat.id} className="hover:bg-dwellio-ivory/20 transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{cat.icon || '📁'}</span>
                            <div>
                              <div className="font-bold text-dwellio-teal">{cat.name}</div>
                              {cat.description && (
                                <div className="text-[11px] text-dwellio-teal/60 line-clamp-1">
                                  {cat.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-dwellio-teal/70">{cat.slug}</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {cat.rooms.map((room) => (
                              <span
                                key={room}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-dwellio-mint/30 text-dwellio-teal font-medium capitalize"
                              >
                                {room}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                              cat.isActive
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                          >
                            {cat.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEditCategory(cat)}
                              className="px-2.5 py-1 bg-white border border-dwellio-mint/60 hover:bg-dwellio-ivory text-dwellio-teal font-bold rounded-lg transition"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleCategoryStatus(cat)}
                              className={`px-2.5 py-1 font-bold rounded-lg transition ${
                                cat.isActive
                                  ? 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                                  : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
                              }`}
                            >
                              {cat.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ----------------- Sub-Tab 2: Services ----------------- */}
      {subTab === 'services' && (
        <div className="space-y-4">
          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-dwellio-teal">Filter by Category:</span>
            <select
              value={selectedCatFilter}
              onChange={(e) => setSelectedCatFilter(e.target.value)}
              className="text-xs p-1.5 bg-white border border-dwellio-mint/60 rounded-xl focus:outline-hidden"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {isSvcLoading ? (
            <div className="py-16 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-dwellio-teal border-t-transparent mb-3" />
              <p className="text-sm font-semibold text-dwellio-teal/70">Loading services...</p>
            </div>
          ) : services.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-dwellio-mint/40">
              <p className="text-sm font-bold text-dwellio-teal">No services found</p>
              <p className="text-xs text-dwellio-teal/60 mt-1">
                No services found for the selected category filter.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-dwellio-mint/40 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-dwellio-teal">
                  <thead className="bg-dwellio-ivory/50 border-b border-dwellio-mint/30 font-bold">
                    <tr>
                      <th className="py-3 px-4">Service</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Slug</th>
                      <th className="py-3 px-4">Base Price</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dwellio-mint/20">
                    {services.map((svc) => {
                      const parentCat = categories.find((c) => c.id === svc.categoryId);
                      return (
                        <tr key={svc.id} className="hover:bg-dwellio-ivory/20 transition">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{svc.icon || '🔧'}</span>
                              <div>
                                <div className="font-bold text-dwellio-teal">{svc.name}</div>
                                {svc.description && (
                                  <div className="text-[11px] text-dwellio-teal/60 line-clamp-1">
                                    {svc.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-semibold text-dwellio-teal/80">
                            {parentCat?.name || svc.categoryId}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-dwellio-teal/70">{svc.slug}</td>
                          <td className="py-3 px-4 font-black text-dwellio-teal">
                            ₹{svc.basePrice ?? 499}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                svc.isActive
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-slate-100 text-slate-700 border-slate-300'
                              }`}
                            >
                              {svc.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenEditService(svc)}
                                className="px-2.5 py-1 bg-white border border-dwellio-mint/60 hover:bg-dwellio-ivory text-dwellio-teal font-bold rounded-lg transition"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleServiceStatus(svc)}
                                className={`px-2.5 py-1 font-bold rounded-lg transition ${
                                  svc.isActive
                                    ? 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                                    : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
                                }`}
                              >
                                {svc.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ----------------- Modal: Category Create/Edit ----------------- */}
      {(isAddCatModalOpen || editingCategory) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-dwellio-mint/40 space-y-4">
            <h3 className="text-base font-bold text-dwellio-teal">
              {editingCategory ? `Edit Category: ${editingCategory.name}` : 'Create New Category'}
            </h3>

            <form onSubmit={handleSaveCategory} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-dwellio-teal mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={catFormData.name}
                  onChange={(e) => setCatFormData({ ...catFormData, name: e.target.value })}
                  placeholder="e.g. Electrical & Lighting"
                  className="w-full text-xs p-2.5 border border-dwellio-mint/60 rounded-xl focus:outline-hidden"
                />
              </div>

              {!editingCategory && (
                <div>
                  <label className="block text-xs font-bold text-dwellio-teal mb-1">
                    Slug (optional - auto-derived if blank)
                  </label>
                  <input
                    type="text"
                    value={catFormData.slug || ''}
                    onChange={(e) => setCatFormData({ ...catFormData, slug: e.target.value })}
                    placeholder="e.g. electrical-lighting"
                    className="w-full text-xs p-2.5 border border-dwellio-mint/60 rounded-xl focus:outline-hidden font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-dwellio-teal mb-1">Description</label>
                <textarea
                  value={catFormData.description || ''}
                  onChange={(e) => setCatFormData({ ...catFormData, description: e.target.value })}
                  placeholder="Short description of this service category..."
                  rows={2}
                  className="w-full text-xs p-2.5 border border-dwellio-mint/60 rounded-xl focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-dwellio-teal mb-1">Icon (Emoji)</label>
                  <input
                    type="text"
                    value={catFormData.icon || ''}
                    onChange={(e) => setCatFormData({ ...catFormData, icon: e.target.value })}
                    placeholder="e.g. ⚡"
                    className="w-full text-xs p-2.5 border border-dwellio-mint/60 rounded-xl focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-dwellio-teal mb-1.5">
                  Cutaway House Rooms
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AVAILABLE_ROOMS.map((room) => {
                    const isChecked = catFormData.rooms?.includes(room.id);
                    return (
                      <label
                        key={room.id}
                        className="flex items-center gap-2 p-2 bg-dwellio-ivory/50 rounded-lg text-xs cursor-pointer border border-dwellio-mint/30"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const current = catFormData.rooms || [];
                            const updated = e.target.checked
                              ? [...current, room.id]
                              : current.filter((r) => r !== room.id);
                            setCatFormData({ ...catFormData, rooms: updated });
                          }}
                          className="rounded text-dwellio-teal"
                        />
                        <span>{room.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setIsAddCatModalOpen(false);
                    setEditingCategory(null);
                  }}
                  className="px-4 py-2 border border-dwellio-mint/50 rounded-xl text-xs font-bold text-dwellio-teal hover:bg-dwellio-ivory transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-dwellio-teal hover:bg-dwellio-teal/90 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingCategory ? 'Save Changes' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- Modal: Service Create/Edit ----------------- */}
      {(isAddSvcModalOpen || editingService) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-dwellio-mint/40 space-y-4">
            <h3 className="text-base font-bold text-dwellio-teal">
              {editingService ? `Edit Service: ${editingService.name}` : 'Create New Service Offering'}
            </h3>

            <form onSubmit={handleSaveService} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-dwellio-teal mb-1">Parent Category *</label>
                <select
                  required
                  value={svcFormData.categoryId}
                  onChange={(e) => setSvcFormData({ ...svcFormData, categoryId: e.target.value })}
                  className="w-full text-xs p-2.5 border border-dwellio-mint/60 rounded-xl focus:outline-hidden"
                >
                  <option value="" disabled>
                    Select Category
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-dwellio-teal mb-1">Service Name *</label>
                <input
                  type="text"
                  required
                  value={svcFormData.name}
                  onChange={(e) => setSvcFormData({ ...svcFormData, name: e.target.value })}
                  placeholder="e.g. EV Charger Installation"
                  className="w-full text-xs p-2.5 border border-dwellio-mint/60 rounded-xl focus:outline-hidden"
                />
              </div>

              {!editingService && (
                <div>
                  <label className="block text-xs font-bold text-dwellio-teal mb-1">
                    Slug (optional - auto-derived if blank)
                  </label>
                  <input
                    type="text"
                    value={svcFormData.slug || ''}
                    onChange={(e) => setSvcFormData({ ...svcFormData, slug: e.target.value })}
                    placeholder="e.g. ev-charger-installation"
                    className="w-full text-xs p-2.5 border border-dwellio-mint/60 rounded-xl focus:outline-hidden font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-dwellio-teal mb-1">Description</label>
                <textarea
                  value={svcFormData.description || ''}
                  onChange={(e) => setSvcFormData({ ...svcFormData, description: e.target.value })}
                  placeholder="Detailed description of the service offering..."
                  rows={2}
                  className="w-full text-xs p-2.5 border border-dwellio-mint/60 rounded-xl focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-dwellio-teal mb-1">Base Price (₹ INR) *</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={svcFormData.basePrice ?? 499}
                  onChange={(e) => setSvcFormData({ ...svcFormData, basePrice: Number(e.target.value) })}
                  placeholder="e.g. 499"
                  className="w-full text-xs p-2.5 border border-dwellio-mint/60 rounded-xl focus:outline-hidden"
                />
                <span className="text-[10px] text-dwellio-teal/60">
                  Platform catalog base price (used as starting booking price snapshot)
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-dwellio-teal mb-1">Icon (Emoji)</label>
                <input
                  type="text"
                  value={svcFormData.icon || ''}
                  onChange={(e) => setSvcFormData({ ...svcFormData, icon: e.target.value })}
                  placeholder="e.g. 🔌"
                  className="w-full text-xs p-2.5 border border-dwellio-mint/60 rounded-xl focus:outline-hidden"
                />
              </div>

              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setIsAddSvcModalOpen(false);
                    setEditingService(null);
                  }}
                  className="px-4 py-2 border border-dwellio-mint/50 rounded-xl text-xs font-bold text-dwellio-teal hover:bg-dwellio-ivory transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-dwellio-teal hover:bg-dwellio-teal/90 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingService ? 'Save Changes' : 'Create Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

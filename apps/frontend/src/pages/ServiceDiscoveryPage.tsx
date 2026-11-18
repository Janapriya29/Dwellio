import React, { useState, useEffect, useCallback } from 'react';
import { HouseRoom, CategoryData, ServiceData, PublicProviderData } from '@dwellio/shared';
import { HouseCutaway } from '../components/discovery/HouseCutaway';
import { RoomDetailPanel } from '../components/discovery/RoomDetailPanel';
import { fetchCategories, fetchServices, fetchApprovedProviders } from '../services/catalogService';

const ROOM_PILLS: { room: HouseRoom; label: string }[] = [
  { room: 'roof', label: 'Roof' },
  { room: 'bath', label: 'Bathroom' },
  { room: 'living', label: 'Living Room' },
  { room: 'kitchen', label: 'Kitchen' },
  { room: 'garden', label: 'Garden & Outside' },
];

const STANDARD_SERVICE_AREAS = [
  'Central Metro',
  'West Coast',
  'South Metro',
  'East City Zone',
  'North Suburbs',
];

interface ServiceDiscoveryPageProps {
  initialRoom?: HouseRoom;
  onRequireAuth?: () => void;
}

export const ServiceDiscoveryPage: React.FC<ServiceDiscoveryPageProps> = ({
  initialRoom = 'living',
  onRequireAuth,
}) => {
  const [selectedRoom, setSelectedRoom] = useState<HouseRoom>(initialRoom);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedArea, setSelectedArea] = useState<string>('');

  useEffect(() => {
    if (initialRoom) {
      setSelectedRoom(initialRoom);
    }
  }, [initialRoom]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [services, setServices] = useState<ServiceData[]>([]);
  const [providers, setProviders] = useState<PublicProviderData[]>([]);
  const [discoveredAreas, setDiscoveredAreas] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadRoomData = useCallback(async (room: HouseRoom, area?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const providerQuery = area && area.trim() ? { room, serviceArea: area.trim() } : room;
      const [fetchedCategories, fetchedServices, fetchedProviders] = await Promise.all([
        fetchCategories(room).catch(() => [] as CategoryData[]),
        fetchServices().catch(() => [] as ServiceData[]),
        fetchApprovedProviders(providerQuery),
      ]);

      setCategories(fetchedCategories);
      if (fetchedCategories.length > 0) {
        const categoryIds = new Set(fetchedCategories.map((c) => c.id));
        setServices(fetchedServices.filter((s) => categoryIds.has(s.categoryId)));
      } else {
        setServices(fetchedServices);
      }
      setProviders(fetchedProviders);

      // Accumulate unique service areas dynamically from fetched providers
      if (fetchedProviders && fetchedProviders.length > 0) {
        setDiscoveredAreas((prev) => {
          const areaSet = new Set(prev);
          fetchedProviders.forEach((p) => {
            const trimmed = p.serviceArea?.trim();
            if (trimmed) {
              areaSet.add(trimmed);
            }
          });
          return Array.from(areaSet);
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load room details';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoomData(selectedRoom, selectedArea);
  }, [selectedRoom, selectedArea, loadRoomData]);

  // Client-side search query filtering
  const searchLower = searchQuery.trim().toLowerCase();
  const displayedServices = searchLower
    ? services.filter(
        (s) =>
          s.name.toLowerCase().includes(searchLower) ||
          (s.description && s.description.toLowerCase().includes(searchLower))
      )
    : services;

  const displayedProviders = searchLower
    ? providers.filter(
        (p) =>
          p.displayName.toLowerCase().includes(searchLower) ||
          p.skills.some((sk) => sk.toLowerCase().includes(searchLower)) ||
          p.serviceArea.toLowerCase().includes(searchLower)
      )
    : providers;

  const hasActiveFilters = Boolean(searchQuery.trim() || selectedArea);

  // Derive unique service areas from standard defaults, accumulated discovered areas, and current selection
  const availableServiceAreas = React.useMemo(() => {
    const areaSet = new Set<string>();

    // 1. Add standard metro areas
    STANDARD_SERVICE_AREAS.forEach((area) => {
      const trimmed = area.trim();
      if (trimmed) areaSet.add(trimmed);
    });

    // 2. Add accumulated dynamically discovered areas
    discoveredAreas.forEach((area) => {
      const trimmed = area.trim();
      if (trimmed) areaSet.add(trimmed);
    });

    // 3. Add areas from currently loaded providers
    providers.forEach((p) => {
      const trimmed = p.serviceArea?.trim();
      if (trimmed) areaSet.add(trimmed);
    });

    // 4. Ensure actively selected area is included
    if (selectedArea && selectedArea.trim()) {
      areaSet.add(selectedArea.trim());
    }

    return Array.from(areaSet).sort((a, b) => a.localeCompare(b));
  }, [discoveredAreas, providers, selectedArea]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedArea('');
  };

  return (
    <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10">
      {/* Intro Hero */}
      <section className="mb-8">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-dwellio-teal max-w-2xl leading-tight">
          Pick a room. See who&apos;s verified to fix it.
        </h1>
        <p className="mt-3 text-base sm:text-lg text-dwellio-teal/75 max-w-2xl leading-relaxed">
          Every professional on Dwellio is checked by our admin team before they can take a job.
          Tap a part of the house cutaway below to discover verified specialists.
        </p>

        {/* Quick Selection Pills (Useful for mobile & keyboard users) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-4 scrollbar-none">
          <span className="text-xs font-bold text-dwellio-teal/60 uppercase tracking-wider whitespace-nowrap mr-1">
            Rooms:
          </span>
          {ROOM_PILLS.map(({ room, label }) => {
            const isSelected = selectedRoom === room;
            return (
              <button
                key={room}
                type="button"
                onClick={() => setSelectedRoom(room)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 ${
                  isSelected
                    ? 'bg-dwellio-teal text-white shadow-xs'
                    : 'bg-white/80 text-dwellio-teal/80 border border-dwellio-mint/60 hover:bg-white hover:text-dwellio-teal'
                }`}
                aria-pressed={isSelected}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Search & Locality Filter Controls */}
        <div className="mt-5 p-4 rounded-3xl bg-white border border-dwellio-mint/50 shadow-xs flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Keyword Search Input */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-dwellio-teal/40">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search services, skills, or specialists (e.g. plumbing, AC, waterproofing)..."
              className="w-full pl-10 pr-8 py-2.5 rounded-2xl bg-dwellio-ivory/50 border border-dwellio-mint/60 text-xs sm:text-sm text-dwellio-teal placeholder-dwellio-teal/40 focus:outline-none focus:ring-2 focus:ring-dwellio-teal focus:bg-white transition"
              aria-label="Search services and specialists"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-3 flex items-center text-xs text-dwellio-teal/50 hover:text-dwellio-teal"
                aria-label="Clear search text"
              >
                ✕
              </button>
            )}
          </div>

          {/* Operating Area Selector */}
          <div className="flex-shrink-0 w-full md:w-56">
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-dwellio-ivory/50 border border-dwellio-mint/60 text-xs sm:text-sm font-medium text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal focus:bg-white transition"
              aria-label="Filter by service area"
            >
              <option value="">All Operating Areas</option>
              {availableServiceAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="px-3.5 py-2.5 rounded-2xl text-xs font-bold text-dwellio-teal bg-dwellio-ivory border border-dwellio-mint hover:bg-dwellio-mint/30 transition whitespace-nowrap"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Active Filters Summary */}
        {hasActiveFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-dwellio-teal/70">
            <span className="font-bold">Active filters:</span>
            {searchQuery.trim() && (
              <span className="px-2.5 py-0.5 rounded-full bg-dwellio-mint/30 border border-dwellio-mint/60 text-dwellio-teal font-medium">
                Keyword: &ldquo;{searchQuery.trim()}&rdquo;
              </span>
            )}
            {selectedArea && (
              <span className="px-2.5 py-0.5 rounded-full bg-dwellio-mint/30 border border-dwellio-mint/60 text-dwellio-teal font-medium">
                Area: {selectedArea}
              </span>
            )}
            <span className="text-dwellio-teal/50 font-medium">
              ({displayedProviders.length} matching {displayedProviders.length === 1 ? 'provider' : 'providers'})
            </span>
          </div>
        )}
      </section>

      {/* 2-Column Responsive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: House Cutaway */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <HouseCutaway
            selectedRoom={selectedRoom}
            onSelectRoom={(room) => setSelectedRoom(room)}
          />
          <p className="text-xs text-dwellio-teal/60 mt-3 text-center">
            💡 <strong>Tip:</strong> Use <kbd className="px-1.5 py-0.5 rounded bg-white border border-dwellio-mint text-[11px]">Tab</kbd> and <kbd className="px-1.5 py-0.5 rounded bg-white border border-dwellio-mint text-[11px]">Enter</kbd> to explore rooms using your keyboard.
          </p>
        </div>

        {/* Right Column: Room Detail Panel */}
        <div className="lg:col-span-6">
          <RoomDetailPanel
            selectedRoom={selectedRoom}
            categories={categories}
            services={displayedServices}
            providers={displayedProviders}
            isLoading={isLoading}
            error={error}
            onRetry={() => loadRoomData(selectedRoom, selectedArea)}
            onRequireAuth={onRequireAuth}
          />
        </div>
      </div>
    </div>
  );
};

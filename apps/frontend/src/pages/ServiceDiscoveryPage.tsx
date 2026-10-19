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

export const ServiceDiscoveryPage: React.FC = () => {
  const [selectedRoom, setSelectedRoom] = useState<HouseRoom>('living');
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [services, setServices] = useState<ServiceData[]>([]);
  const [providers, setProviders] = useState<PublicProviderData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadRoomData = useCallback(async (room: HouseRoom) => {
    setIsLoading(true);
    setError(null);
    try {
      const [fetchedCategories, fetchedServices, fetchedProviders] = await Promise.all([
        fetchCategories(room).catch(() => [] as CategoryData[]),
        fetchServices().catch(() => [] as ServiceData[]),
        fetchApprovedProviders(room),
      ]);

      setCategories(fetchedCategories);
      if (fetchedCategories.length > 0) {
        const categoryIds = new Set(fetchedCategories.map((c) => c.id));
        setServices(fetchedServices.filter((s) => categoryIds.has(s.categoryId)));
      } else {
        setServices(fetchedServices);
      }
      setProviders(fetchedProviders);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load room details';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoomData(selectedRoom);
  }, [selectedRoom, loadRoomData]);

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
            services={services}
            providers={providers}
            isLoading={isLoading}
            error={error}
            onRetry={() => loadRoomData(selectedRoom)}
          />
        </div>
      </div>
    </div>
  );
};

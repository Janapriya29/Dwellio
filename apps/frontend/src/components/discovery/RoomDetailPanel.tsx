import React, { useState } from 'react';
import { HouseRoom, CategoryData, ServiceData, PublicProviderData } from '@dwellio/shared';
import { VerificationRing } from './VerificationRing';
import { BookingModal } from '../booking/BookingModal';

interface RoomDetailPanelProps {
  selectedRoom: HouseRoom;
  categories: CategoryData[];
  services: ServiceData[];
  providers: PublicProviderData[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

const ROOM_METADATA: Record<HouseRoom, { title: string; description: string; defaultSkills: string[] }> = {
  roof: {
    title: 'Roof & Structure',
    description: 'Waterproofing, terrace crack repairs, gutter clearing, and thermal insulation.',
    defaultSkills: ['Waterproofing', 'Roof Repair', 'Gutter Cleaning'],
  },
  bath: {
    title: 'Bathroom & Plumbing',
    description: 'Leak detection, pipe repairs, faucet installation, tile grouting, and water heater service.',
    defaultSkills: ['Plumbing', 'Tiling', 'Leak Repair', 'Water Heaters'],
  },
  living: {
    title: 'Living Room & Electrical',
    description: 'Power distribution, switchboard servicing, interior painting, and AC tune-ups.',
    defaultSkills: ['Electrician', 'AC Service', 'Painting', 'Ceiling Fans'],
  },
  kitchen: {
    title: 'Kitchen & Appliances',
    description: 'Appliance diagnostics (refrigerators, microwaves, wet grinders), sink plumbing, and chimney care.',
    defaultSkills: ['Appliance Repair', 'Plumbing', 'Chimney Cleaning'],
  },
  garden: {
    title: 'Garden & Exterior',
    description: 'Pest fumigation, landscaping, lawn upkeep, pressure washing, and outdoor drainage.',
    defaultSkills: ['Pest Control', 'Gardening', 'Pressure Washing'],
  },
};

export const RoomDetailPanel: React.FC<RoomDetailPanelProps> = ({
  selectedRoom,
  categories,
  services,
  providers,
  isLoading,
  error,
  onRetry,
}) => {
  const [selectedProviderForBooking, setSelectedProviderForBooking] = useState<PublicProviderData | null>(null);

  const roomMeta = ROOM_METADATA[selectedRoom] || {
    title: selectedRoom,
    description: 'Services and verified professionals for this area.',
    defaultSkills: [],
  };

  // Derive service chips to display
  const serviceChips = services.length > 0
    ? services.map((s) => s.name)
    : roomMeta.defaultSkills;

  return (
    <aside
      className="bg-white rounded-3xl p-6 sm:p-8 border border-dwellio-mint/40 shadow-sm relative transition-all"
      aria-live="polite"
    >
      {/* Room Header */}
      <div className="border-b border-dwellio-mint/30 pb-5 mb-5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-semibold tracking-wider uppercase text-dwellio-teal/60 bg-dwellio-ivory px-3 py-1 rounded-full border border-dwellio-mint/40">
            Selected Room
          </span>
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Verified Network
          </span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-dwellio-teal tracking-tight">
          {roomMeta.title}
        </h2>
        <p className="text-sm text-dwellio-teal/70 mt-1 leading-relaxed">
          {roomMeta.description}
        </p>
      </div>

      {/* Available Services Section */}
      <div className="mb-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-dwellio-teal/70 mb-3">
          Available Services &amp; Specialties
        </h3>
        <div className="flex flex-wrap gap-2">
          {serviceChips.map((chip, idx) => (
            <span
              key={idx}
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-dwellio-ivory text-dwellio-teal border border-dwellio-mint/60 shadow-xs hover:border-dwellio-teal/40 transition-colors"
            >
              {chip}
            </span>
          ))}
          {categories.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium text-dwellio-teal/50 bg-slate-50">
              {categories.map((c) => c.name).join(' • ')}
            </span>
          )}
        </div>
      </div>

      {/* Verified Professionals Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-dwellio-teal/70">
            Approved Professionals ({isLoading ? '...' : providers.length})
          </h3>
          <span className="text-[11px] text-dwellio-teal/50">
            Admin Checked
          </span>
        </div>

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="space-y-4 animate-pulse">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/50"
              >
                <div className="w-12 h-12 rounded-full bg-slate-200 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="h-3 bg-slate-200 rounded w-1/2" />
                </div>
                <div className="w-16 h-8 bg-slate-200 rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
            <p className="font-semibold mb-1">Failed to load verified professionals</p>
            <p className="text-xs text-amber-700 mb-3">{error}</p>
            <button
              onClick={onRetry}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && providers.length === 0 && (
          <div className="text-center py-8 px-4 rounded-2xl border border-dashed border-dwellio-mint/60 bg-dwellio-ivory/40">
            <div className="w-10 h-10 mx-auto rounded-full bg-dwellio-mint/30 flex items-center justify-center text-dwellio-teal mb-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-dwellio-teal">
              No approved professionals found for this room yet
            </p>
            <p className="text-xs text-dwellio-teal/60 mt-1 max-w-xs mx-auto">
              Our admin team is currently vetting service providers for this category. Check back shortly!
            </p>
          </div>
        )}

        {/* Provider List */}
        {!isLoading && !error && providers.length > 0 && (
          <div className="space-y-3">
            {providers.map((pro) => (
              <div
                key={pro.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-dwellio-mint/40 bg-white hover:border-dwellio-teal/30 hover:shadow-xs transition duration-200"
              >
                {/* Left: Verification Ring + Details */}
                <div className="flex items-start sm:items-center gap-3.5">
                  <VerificationRing providerName={pro.displayName} passedChecks={4} totalChecks={4} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-dwellio-teal">
                        {pro.displayName}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Fully Verified
                      </span>
                    </div>

                    {/* Customer Rating / Review Summary */}
                    <div className="flex items-center gap-2 mt-0.5">
                      {pro.reviewCount && pro.reviewCount > 0 ? (
                        <div className="inline-flex items-center gap-1.5 text-xs">
                          <span className="text-amber-500 font-bold">★</span>
                          <span className="font-bold text-dwellio-teal">
                            {Number(pro.ratingAverage).toFixed(1)}
                          </span>
                          <span className="text-dwellio-teal/60 font-medium">
                            ({pro.reviewCount} {pro.reviewCount === 1 ? 'review' : 'reviews'})
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-dwellio-teal/50 italic">
                          No reviews yet
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-dwellio-teal/70 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium text-dwellio-teal">
                        {pro.skills.join(', ')}
                      </span>
                      {pro.serviceArea && (
                        <>
                          <span className="text-dwellio-teal/30">•</span>
                          <span>Serving {pro.serviceArea}</span>
                        </>
                      )}
                    </div>

                    <div className="text-[11px] text-dwellio-teal/50 mt-1 flex items-center gap-1.5">
                      <span className="text-emerald-600 font-semibold">4 of 4 checks:</span>
                      <span>ID, Skill, Background &amp; Admin</span>
                    </div>
                  </div>
                </div>

                {/* Right: Book Action */}
                <div className="sm:self-center flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-dwellio-mint/20 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedProviderForBooking(pro)}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 text-xs font-bold rounded-xl bg-[#D9653B] text-white hover:bg-[#c4562f] shadow-xs hover:shadow transition duration-150 focus:outline-none focus:ring-2 focus:ring-[#D9653B] focus:ring-offset-2"
                  >
                    Book
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notice Banner: Transparent Disclaimers */}
      <div className="mt-6 pt-4 border-t border-dwellio-mint/30 flex items-start gap-2.5 text-xs text-dwellio-teal/60">
        <svg className="w-4 h-4 text-dwellio-teal/40 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>
          Professionals shown are verified by Dwellio administration through credential validation and skills assessment.
        </p>
      </div>

      {/* Real Interactive Booking Modal */}
      {selectedProviderForBooking && (
        <BookingModal
          isOpen={true}
          provider={selectedProviderForBooking}
          services={services}
          selectedRoom={selectedRoom}
          onClose={() => setSelectedProviderForBooking(null)}
        />
      )}
    </aside>
  );
};

import React from 'react';
import { HouseRoom } from '@dwellio/shared';

interface LandingPageProps {
  onExploreServices: (room?: HouseRoom) => void;
  onOpenLogin: () => void;
  onOpenCustomerSignUp: () => void;
  onOpenProviderApply: () => void;
}

const CATEGORY_SHOWCASE: {
  room: HouseRoom;
  title: string;
  icon: string;
  description: string;
  services: string[];
  gradient: string;
}[] = [
  {
    room: 'roof',
    title: 'Roofing & Waterproofing',
    icon: '🏠',
    description: 'Terrace waterproofing, leak remediation, tile replacement, and structural gutter cleaning.',
    services: ['Waterproofing', 'Roof Repair', 'Gutter Cleaning'],
    gradient: 'from-amber-500/10 to-orange-500/10',
  },
  {
    room: 'bath',
    title: 'Plumbing & Sanitary',
    icon: '💧',
    description: 'Bathroom fittings, advanced pressure leak detection, sanitary piping, and tile grout restoration.',
    services: ['General Plumbing', 'Tiling Repairs', 'Leak Detection'],
    gradient: 'from-sky-500/10 to-blue-500/10',
  },
  {
    room: 'living',
    title: 'Electrical & Climate Control',
    icon: '⚡',
    description: 'Switchboards, breaker panels, ceiling fans, interior painting, and complete AC tune-ups.',
    services: ['Electrician', 'AC Servicing', 'Interior Painting'],
    gradient: 'from-emerald-500/10 to-teal-500/10',
  },
  {
    room: 'kitchen',
    title: 'Kitchen & Appliance Care',
    icon: '🍳',
    description: 'Refrigerator diagnostics, microwave repair, wet grinder service, and deep chimney degreasing.',
    services: ['Appliance Repair', 'Chimney Cleaning', 'Sink Plumbing'],
    gradient: 'from-rose-500/10 to-red-500/10',
  },
  {
    room: 'garden',
    title: 'Garden & Outdoor Care',
    icon: '🌿',
    description: 'Lawn upkeep, eco-friendly pest fumigation, landscaping, and driveway high-pressure washing.',
    services: ['Pest Control', 'Gardening & Pruning', 'Pressure Washing'],
    gradient: 'from-lime-500/10 to-green-500/10',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onExploreServices,
  onOpenLogin,
  onOpenCustomerSignUp,
  onOpenProviderApply,
}) => {
  return (
    <div className="w-full">
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden pt-8 pb-16 sm:pt-14 sm:pb-24 border-b border-dwellio-mint/40 bg-gradient-to-b from-white/60 via-dwellio-ivory to-dwellio-ivory">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
            {/* Trust badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-dwellio-mint/30 text-dwellio-teal border border-dwellio-mint/60 mb-6 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>100% Admin-Verified Trade Professionals</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-dwellio-teal leading-tight sm:leading-none">
              Your Home, <br className="hidden sm:inline" />
              <span className="text-dwellio-teal inline-flex items-center gap-2">
                in Good Hands
                <span className="w-3 h-3 sm:w-4 sm:h-4 rounded-xs bg-[#D9653B]" aria-hidden="true" />
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mt-5 text-base sm:text-xl text-dwellio-teal/80 leading-relaxed max-w-2xl">
              Pick a room. See who&apos;s verified to fix it. Connect with background-checked local
              specialists for roofing, plumbing, electrical, and appliance care with guaranteed time-slot
              reservations.
            </p>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => onExploreServices('living')}
                className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-dwellio-teal text-white font-extrabold text-sm sm:text-base hover:bg-dwellio-teal/90 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <span>🏠 Explore Services</span>
                <span>&rarr;</span>
              </button>

              <button
                type="button"
                onClick={onOpenCustomerSignUp}
                className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-white text-dwellio-teal font-bold text-sm sm:text-base border border-dwellio-mint hover:bg-dwellio-mint/20 shadow-xs transition-all"
              >
                Customer Sign Up
              </button>

              <button
                type="button"
                onClick={onOpenProviderApply}
                className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-[#D9653B] text-white font-bold text-sm sm:text-base hover:bg-[#c4562f] shadow-xs transition-all"
              >
                Become a Provider
              </button>
            </div>

            {/* Secondary Login hint */}
            <p className="text-xs text-dwellio-teal/60 mt-4">
              Already registered on Dwellio?{' '}
              <button
                type="button"
                onClick={onOpenLogin}
                className="font-bold text-dwellio-teal underline hover:text-[#D9653B]"
              >
                Sign In to your account
              </button>
            </p>
          </div>

          {/* Value Props Row */}
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 pt-10 border-t border-dwellio-mint/30">
            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-white/70 border border-dwellio-mint/40">
              <span className="text-2xl p-2 rounded-xl bg-dwellio-ivory">🛡️</span>
              <div>
                <h2 className="font-extrabold text-sm text-dwellio-teal">Admin-Vetted Only</h2>
                <p className="text-xs text-dwellio-teal/70 mt-0.5">
                  Every specialist passes a 4-check verification: ID, skill test, criminal background &amp; manual admin approval.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-white/70 border border-dwellio-mint/40">
              <span className="text-2xl p-2 rounded-xl bg-dwellio-ivory">⏱️</span>
              <div>
                <h2 className="font-extrabold text-sm text-dwellio-teal">Guaranteed Time Slots</h2>
                <p className="text-xs text-dwellio-teal/70 mt-0.5">
                  Direct slot reservation prevents double-booking. Choose an exact 2-hour window that fits your schedule.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-white/70 border border-dwellio-mint/40">
              <span className="text-2xl p-2 rounded-xl bg-dwellio-ivory">⭐</span>
              <div>
                <h2 className="font-extrabold text-sm text-dwellio-teal">100% Verified Reviews</h2>
                <p className="text-xs text-dwellio-teal/70 mt-0.5">
                  Reviews can only be submitted after a verified booking reaches completed status. No fake reviews.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. HOW IT WORKS (3 SIMPLE STEPS) */}
      <section className="py-14 sm:py-20 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-dwellio-teal/60 bg-dwellio-mint/30 px-3 py-1 rounded-full border border-dwellio-mint/50">
            Simple &amp; Reliable
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-dwellio-teal mt-3">
            How Dwellio Works
          </h2>
          <p className="text-xs sm:text-sm text-dwellio-teal/70 mt-1.5">
            Book trusted trade specialists in three effortless steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          <div className="p-6 rounded-3xl bg-white border border-dwellio-mint/40 shadow-xs relative">
            <span className="w-9 h-9 rounded-2xl bg-dwellio-teal text-dwellio-mint font-black text-sm flex items-center justify-center mb-4">
              01
            </span>
            <h3 className="font-bold text-base text-dwellio-teal">Pick a Room or Service</h3>
            <p className="text-xs sm:text-sm text-dwellio-teal/70 mt-2 leading-relaxed">
              Use our interactive cutaway or category list to find the exact service your home requires, from roof leaks to kitchen appliances.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-white border border-dwellio-mint/40 shadow-xs relative">
            <span className="w-9 h-9 rounded-2xl bg-[#D9653B] text-white font-black text-sm flex items-center justify-center mb-4">
              02
            </span>
            <h3 className="font-bold text-base text-dwellio-teal">Select a Verified Pro</h3>
            <p className="text-xs sm:text-sm text-dwellio-teal/70 mt-2 leading-relaxed">
              Examine verified skill rings, authentic customer feedback, and operating zones. All providers are admin-cleared.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-white border border-dwellio-mint/40 shadow-xs relative">
            <span className="w-9 h-9 rounded-2xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center mb-4">
              03
            </span>
            <h3 className="font-bold text-base text-dwellio-teal">Reserve &amp; Track Status</h3>
            <p className="text-xs sm:text-sm text-dwellio-teal/70 mt-2 leading-relaxed">
              Lock in your appointment slot. Receive live notifications as the provider accepts, arrives, and completes your service.
            </p>
          </div>
        </div>
      </section>

      {/* 3. SERVICE CATEGORIES SHOWCASE */}
      <section className="py-14 sm:py-20 border-t border-dwellio-mint/30 bg-white/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-dwellio-teal/60 bg-dwellio-ivory px-3 py-1 rounded-full border border-dwellio-mint/40">
                Full Service Catalog
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-dwellio-teal mt-3">
                Explore What We Fix &amp; Maintain
              </h2>
              <p className="text-xs sm:text-sm text-dwellio-teal/70 mt-1">
                Browse our five primary home zones or jump straight to the interactive cutaway.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onExploreServices()}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-dwellio-teal hover:text-[#D9653B] transition"
            >
              <span>View Interactive House Cutaway</span>
              <span>&rarr;</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {CATEGORY_SHOWCASE.map((cat) => (
              <div
                key={cat.room}
                className="p-6 rounded-3xl bg-white border border-dwellio-mint/50 shadow-xs hover:border-dwellio-teal/40 hover:shadow-sm transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-3xl p-3 rounded-2xl bg-dwellio-ivory border border-dwellio-mint/40">
                      {cat.icon}
                    </span>
                    <span className="text-[11px] font-semibold text-dwellio-teal/50 uppercase tracking-wider">
                      {cat.room.toUpperCase()} ZONE
                    </span>
                  </div>

                  <h3 className="font-extrabold text-lg text-dwellio-teal">{cat.title}</h3>
                  <p className="text-xs text-dwellio-teal/70 mt-2 leading-relaxed">
                    {cat.description}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {cat.services.map((svc) => (
                      <span
                        key={svc}
                        className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-dwellio-ivory text-dwellio-teal border border-dwellio-mint/60"
                      >
                        {svc}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onExploreServices(cat.room)}
                  className="mt-6 w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-dwellio-ivory hover:bg-dwellio-mint/30 text-dwellio-teal border border-dwellio-mint/60 transition flex items-center justify-center gap-1.5"
                >
                  <span>Explore {cat.title.split('&')[0].trim()}</span>
                  <span>&rarr;</span>
                </button>
              </div>
            ))}

            {/* All-in-one interactive teaser card */}
            <div className="p-6 rounded-3xl bg-gradient-to-br from-dwellio-teal to-dwellio-teal/95 text-white flex flex-col justify-between shadow-sm">
              <div>
                <span className="text-3xl p-3 rounded-2xl bg-white/10 inline-block mb-4">
                  🔍
                </span>
                <h3 className="font-extrabold text-lg text-white">Interactive Cutaway View</h3>
                <p className="text-xs text-white/80 mt-2 leading-relaxed">
                  Experience our custom architectural cutaway model. Click room by room to see approved tradespeople, real-time availability, and service pricing.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onExploreServices('living')}
                className="mt-6 w-full py-2.5 px-4 rounded-xl text-xs font-extrabold bg-[#D9653B] hover:bg-[#c4562f] text-white transition shadow-xs flex items-center justify-center gap-1.5"
              >
                <span>Launch Interactive Cutaway</span>
                <span>&rarr;</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. TRUST & 4-POINT VERIFICATION INFORMATION */}
      <section className="py-14 sm:py-20 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="p-8 sm:p-12 rounded-3xl bg-dwellio-ivory/80 border border-dwellio-mint/60 shadow-xs">
          <div className="max-w-2xl mb-8">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300">
              Platform Safety &amp; Trust
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-dwellio-teal mt-3">
              The Dwellio 4-Check Verification Standard
            </h2>
            <p className="text-xs sm:text-sm text-dwellio-teal/70 mt-2">
              Unlike open classifieds where anyone can post a listing, every service provider on Dwellio is audited by our human administrative team.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-dwellio-mint/40">
              <span className="text-xl">🪪</span>
              <h3 className="font-bold text-xs uppercase tracking-wider text-dwellio-teal mt-2">
                1. Government ID
              </h3>
              <p className="text-xs text-dwellio-teal/70 mt-1">
                Identity verified with official photo documentation and address verification.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-dwellio-mint/40">
              <span className="text-xl">🛠️</span>
              <h3 className="font-bold text-xs uppercase tracking-wider text-dwellio-teal mt-2">
                2. Trade Skills
              </h3>
              <p className="text-xs text-dwellio-teal/70 mt-1">
                Prior experience and trade skill portfolio verified for the specific applied room category.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-dwellio-mint/40">
              <span className="text-xl">🔎</span>
              <h3 className="font-bold text-xs uppercase tracking-wider text-dwellio-teal mt-2">
                3. Safety Clearance
              </h3>
              <p className="text-xs text-dwellio-teal/70 mt-1">
                Background verification ensuring homeowner safety and ethical trade standards.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-dwellio-mint/40">
              <span className="text-xl">🛡️</span>
              <h3 className="font-bold text-xs uppercase tracking-wider text-dwellio-teal mt-2">
                4. Admin Approval
              </h3>
              <p className="text-xs text-dwellio-teal/70 mt-1">
                Final approval and active platform monitoring by Dwellio operations administrators.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. BECOME A PROVIDER BANNER */}
      <section className="py-12 border-t border-dwellio-mint/30 bg-gradient-to-r from-dwellio-teal via-dwellio-teal/95 to-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="max-w-xl text-center md:text-left">
            <span className="text-xs font-bold uppercase tracking-wider text-dwellio-mint bg-white/10 px-3 py-1 rounded-full border border-white/20">
              For Tradespeople &amp; Specialists
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-3">
              Grow Your Trade Business With Dwellio
            </h2>
            <p className="text-xs sm:text-sm text-white/80 mt-2 leading-relaxed">
              Receive direct booking requests from verified homeowners. Manage appointments, maintain your reputation with verified reviews, and earn on your schedule.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onOpenProviderApply}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-[#D9653B] text-white font-extrabold text-sm hover:bg-[#c4562f] shadow-md transition"
            >
              Apply as a Service Provider
            </button>
            <button
              type="button"
              onClick={onOpenLogin}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-white/10 text-white font-bold text-sm hover:bg-white/20 border border-white/20 transition"
            >
              Provider Portal Sign In
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

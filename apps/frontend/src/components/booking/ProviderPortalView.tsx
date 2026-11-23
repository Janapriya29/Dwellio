import React, { useState, useEffect, useCallback } from 'react';
import { ProviderProfileData } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import {
  fetchProviderApplicationStatus,
  submitProviderApplication,
} from '../../services/providerService';
import { ProviderDashboardOverview } from '../provider/ProviderDashboardOverview';
import { ProviderBookingsView } from './ProviderBookingsView';
import { ProviderScheduleView } from '../provider/ProviderScheduleView';
import { ProviderReviewsHub } from '../provider/ProviderReviewsHub';
import { ProviderProfileModal } from '../provider/ProviderProfileModal';
import { ProviderEarningsView } from '../provider/ProviderEarningsView';

interface ProviderPortalViewProps {
  onOpenLogin: () => void;
  onOpenApply: () => void;
}

type ProviderWorkspaceTab = 'dashboard' | 'bookings' | 'schedule' | 'reviews' | 'earnings' | 'profile';

const getInitialTab = (): ProviderWorkspaceTab => {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash;
    if (hash.includes('bookingId=')) return 'bookings';
    if (hash.includes('tab=schedule')) return 'schedule';
    if (hash.includes('tab=reviews')) return 'reviews';
    if (hash.includes('tab=earnings')) return 'earnings';
    if (hash.includes('tab=bookings')) return 'bookings';
    if (hash.includes('tab=profile')) return 'profile';
  }
  return 'dashboard';
};

const AVAILABLE_SKILLS = [
  'Waterproofing',
  'Roof repair',
  'Gutter cleaning',
  'Plumbing',
  'Tiling',
  'Leak repair',
  'Electrician',
  'AC service',
  'Painting',
  'Appliance repair',
  'Chimney cleaning',
  'Pest control',
  'Gardening',
  'Pressure washing',
];

export const ProviderPortalView: React.FC<ProviderPortalViewProps> = ({
  onOpenLogin,
  onOpenApply,
}) => {
  const { user, token } = useAuth();
  const [hasApplication, setHasApplication] = useState<boolean>(false);
  const [application, setApplication] = useState<ProviderProfileData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProviderWorkspaceTab>(getInitialTab);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash.includes('bookingId=')) {
        setActiveTab('bookings');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Re-submission form fields
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSuccessMessage, setFormSuccessMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetchProviderApplicationStatus(token);
      setHasApplication(res.hasApplication);
      setApplication(res.application);
      if (res.application) {
        setDisplayName(res.application.displayName || '');
        setPhone(res.application.phone || '');
        setServiceArea(res.application.serviceArea || '');
        setSelectedSkills(res.application.skills || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve application status.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setFormSuccessMessage(null);
    try {
      const updated = await submitProviderApplication(
        {
          displayName: displayName.trim(),
          phone: phone.trim(),
          serviceArea: serviceArea.trim(),
          skills: selectedSkills,
        },
        token
      );
      setApplication(updated);
      setHasApplication(true);
      setFormSuccessMessage('Application resubmitted successfully! It is now pending administrator review.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resubmit application.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. UN机AUTHENTICATED STATE
  if (!token || !user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-dwellio-teal text-dwellio-mint flex items-center justify-center text-3xl mb-5 shadow-xs">
          🔧
        </div>
        <h2 className="text-3xl font-black text-dwellio-teal mb-3 tracking-tight">
          Service Provider Workspace
        </h2>
        <p className="text-sm text-dwellio-teal/70 leading-relaxed max-w-md mx-auto mb-8">
          Manage your service appointments, accept incoming homeowner booking requests, track slot reservations,
          and maintain your verified reputation.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-sm mx-auto">
          <button
            type="button"
            onClick={onOpenLogin}
            className="w-full py-3 px-5 rounded-xl bg-dwellio-teal text-white font-bold text-sm hover:opacity-95 shadow transition"
          >
            Sign In to Provider Portal
          </button>
          <button
            type="button"
            onClick={onOpenApply}
            className="w-full py-3 px-5 rounded-xl bg-[#D9653B] text-white font-bold text-sm hover:bg-[#c4562f] shadow transition"
          >
            Apply to Become a Provider
          </button>
        </div>
      </div>
    );
  }

  // 2. LOADING SKELETON
  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-1/3 mb-6" />
          <div className="h-44 bg-white/70 rounded-3xl border border-dwellio-mint/40" />
        </div>
      </div>
    );
  }

  // 3. CASE: NO APPLICATION YET
  if (!hasApplication && user.role !== 'provider') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="p-8 rounded-3xl bg-white border border-dwellio-mint/50 shadow-sm text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-dwellio-ivory text-dwellio-teal flex items-center justify-center text-2xl mb-4 border border-dwellio-mint/40">
            🛠️
          </div>
          <h2 className="text-2xl font-black text-dwellio-teal mb-2">
            You haven&apos;t applied as a Service Provider yet
          </h2>
          <p className="text-xs sm:text-sm text-dwellio-teal/70 max-w-md mx-auto mb-6">
            Logged in as <strong>{user.name}</strong> ({user.email}). Ready to join Dwellio as a verified trade specialist?
          </p>
          <button
            type="button"
            onClick={onOpenApply}
            className="px-6 py-3 rounded-xl bg-[#D9653B] text-white font-bold text-sm hover:bg-[#c4562f] shadow transition"
          >
            Submit Provider Application
          </button>
        </div>
      </div>
    );
  }

  // 4. CASE: APPLICATION PENDING REVIEW
  if (application && application.verificationStatus === 'pending') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="p-8 rounded-3xl bg-white border border-amber-200 shadow-sm">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <span className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl">
              ⏳
            </span>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                Application Status: Pending Review
              </span>
              <h2 className="text-2xl font-black text-dwellio-teal mt-0.5">
                Your Provider Application is Under Review
              </h2>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-dwellio-teal/75 leading-relaxed mb-6">
            Thank you for applying to Dwellio, <strong>{user.name}</strong>! Our operations administration team is currently evaluating your credentials, ID verification, and trade skill portfolio.
          </p>

          {/* 4 Check Progress */}
          <div className="p-4 rounded-2xl bg-dwellio-ivory border border-dwellio-mint/50 mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-dwellio-teal mb-3">
              Verification Checkpoints
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2 text-dwellio-teal/80">
                <span className="text-emerald-600 font-bold">✓</span>
                <span>Account Registration Complete</span>
              </div>
              <div className="flex items-center gap-2 text-dwellio-teal/80">
                <span className="text-emerald-600 font-bold">✓</span>
                <span>Application Form Received</span>
              </div>
              <div className="flex items-center gap-2 text-amber-700">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>ID &amp; Background Screening In Progress</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <span className="w-2 h-2 rounded-full bg-slate-300" />
                <span>Admin Decision Pending</span>
              </div>
            </div>
          </div>

          {/* Application Details Summary */}
          <div className="border-t border-dwellio-mint/30 pt-5 text-xs space-y-2 text-dwellio-teal/80">
            <div className="flex justify-between py-1 border-b border-dwellio-mint/20">
              <span className="text-dwellio-teal/60">Business / Display Name:</span>
              <span className="font-bold text-dwellio-teal">{application.displayName}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-dwellio-mint/20">
              <span className="text-dwellio-teal/60">Contact Phone:</span>
              <span className="font-medium">{application.phone}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-dwellio-mint/20">
              <span className="text-dwellio-teal/60">Operating Service Area:</span>
              <span className="font-medium">{application.serviceArea}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-dwellio-teal/60">Skills Offered:</span>
              <span className="font-medium">{application.skills.join(', ')}</span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-dwellio-mint/30 flex items-center justify-between text-xs text-dwellio-teal/60">
            <span>You will receive an in-app notification once your application is processed.</span>
            <button
              type="button"
              onClick={loadStatus}
              className="px-3 py-1.5 rounded-lg border border-dwellio-mint bg-dwellio-ivory hover:bg-white text-dwellio-teal font-semibold transition"
            >
              Refresh Status
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5. CASE: APPLICATION REJECTED
  if (application && application.verificationStatus === 'rejected') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="p-8 rounded-3xl bg-white border border-rose-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center text-xl">
              ⚠️
            </span>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                Application Decision: Needs Revision
              </span>
              <h2 className="text-2xl font-black text-dwellio-teal mt-0.5">
                Application Not Approved
              </h2>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200 text-rose-900 text-xs mb-6">
            <strong className="block text-sm mb-1">Administrator Feedback / Reason:</strong>
            <p>{application.rejectionReason || 'Details provided could not be verified by platform administrators.'}</p>
          </div>

          {formSuccessMessage && (
            <div className="p-3.5 mb-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              ✓ {formSuccessMessage}
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 mb-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              Error: {errorMessage}
            </div>
          )}

          <h3 className="text-sm font-bold text-dwellio-teal mb-3 uppercase tracking-wider">
            Update &amp; Resubmit Information
          </h3>

          <form onSubmit={handleResubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-dwellio-teal/80 mb-1">
                Business / Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full px-4 py-2 rounded-xl border border-dwellio-mint bg-dwellio-ivory/30 text-dwellio-teal text-sm focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-dwellio-teal/80 mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-xl border border-dwellio-mint bg-dwellio-ivory/30 text-dwellio-teal text-sm focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-dwellio-teal/80 mb-1">
                  Service Area
                </label>
                <input
                  type="text"
                  value={serviceArea}
                  onChange={(e) => setServiceArea(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-xl border border-dwellio-mint bg-dwellio-ivory/30 text-dwellio-teal text-sm focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-dwellio-teal/80 mb-1.5">
                Skills &amp; Trades Offered
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-dwellio-ivory/30 rounded-xl border border-dwellio-mint/50">
                {AVAILABLE_SKILLS.map((skill) => {
                  const isChecked = selectedSkills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                        isChecked
                          ? 'bg-dwellio-teal text-white shadow-xs'
                          : 'bg-white text-dwellio-teal/80 border border-dwellio-mint/70 hover:bg-dwellio-mint/20'
                      }`}
                    >
                      {isChecked ? '✓ ' : '+ '}
                      {skill}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl bg-dwellio-teal text-white font-bold text-sm hover:opacity-95 transition shadow disabled:opacity-50"
            >
              {isSubmitting ? 'Resubmitting...' : 'Resubmit Application for Review'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 6. CASE: APPROVED PROVIDER (OR ROLE IS PROVIDER)
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-dwellio-mint/40 pb-5">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-dwellio-teal/60">
            Professional Workspace
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-dwellio-teal tracking-tight">
            Provider Partner Portal
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsProfileModalOpen(true)}
            className="px-4 py-2 rounded-xl border border-dwellio-teal/40 bg-white text-dwellio-teal font-bold text-xs hover:bg-dwellio-ivory transition shadow-xs flex items-center gap-1.5"
          >
            <span>⚙️</span>
            <span>Business Profile</span>
          </button>
        </div>
      </div>

      {/* 5-Tab Navigation Pill Bar */}
      <div className="flex flex-wrap items-center gap-2 mb-8 bg-dwellio-ivory/60 p-1.5 rounded-2xl border border-dwellio-mint/50">
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'dashboard'
              ? 'bg-dwellio-teal text-white shadow-xs'
              : 'text-dwellio-teal hover:bg-white/80'
          }`}
        >
          <span>📊</span>
          <span>Dashboard</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('bookings')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'bookings'
              ? 'bg-dwellio-teal text-white shadow-xs'
              : 'text-dwellio-teal hover:bg-white/80'
          }`}
        >
          <span>📋</span>
          <span>Bookings &amp; Jobs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('schedule')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'schedule'
              ? 'bg-dwellio-teal text-white shadow-xs'
              : 'text-dwellio-teal hover:bg-white/80'
          }`}
        >
          <span>🗓️</span>
          <span>Schedule &amp; Availability</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reviews')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'reviews'
              ? 'bg-dwellio-teal text-white shadow-xs'
              : 'text-dwellio-teal hover:bg-white/80'
          }`}
        >
          <span>⭐</span>
          <span>Reviews Hub</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('earnings')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'earnings'
              ? 'bg-dwellio-teal text-white shadow-xs'
              : 'text-dwellio-teal hover:bg-white/80'
          }`}
        >
          <span>💰</span>
          <span>Earnings &amp; Payouts</span>
        </button>

        <button
          type="button"
          onClick={() => setIsProfileModalOpen(true)}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'profile'
              ? 'bg-dwellio-teal text-white shadow-xs'
              : 'text-dwellio-teal hover:bg-white/80'
          }`}
        >
          <span>⚙️</span>
          <span>Settings</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'dashboard' && (
        <ProviderDashboardOverview
          onNavigateTab={(tab) => {
            if (tab === 'profile') setIsProfileModalOpen(true);
            else setActiveTab(tab);
          }}
        />
      )}

      {activeTab === 'bookings' && <ProviderBookingsView />}

      {activeTab === 'schedule' && <ProviderScheduleView />}

      {activeTab === 'reviews' && <ProviderReviewsHub />}

      {activeTab === 'earnings' && <ProviderEarningsView />}

      {activeTab === 'profile' && (
        <div className="bg-white p-8 rounded-3xl border border-dwellio-mint/60 shadow-xs text-center space-y-4">
          <span className="text-4xl block">⚙️</span>
          <h3 className="text-xl font-bold text-dwellio-teal">Provider Business Profile</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Manage your trade credentials, business bio, contact address, service coverage radius, and verified skills.
          </p>
          <button
            type="button"
            onClick={() => setIsProfileModalOpen(true)}
            className="px-6 py-2.5 rounded-xl bg-dwellio-teal text-white font-bold text-xs hover:opacity-95 shadow transition"
          >
            Open Profile Editor
          </button>
        </div>
      )}

      {/* Business Profile Modal */}
      <ProviderProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onProfileUpdated={() => {
          loadStatus();
        }}
      />
    </div>
  );
};

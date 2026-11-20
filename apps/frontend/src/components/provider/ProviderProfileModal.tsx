import React, { useState, useEffect, useCallback } from 'react';
import { ProviderProfileData } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import {
  fetchCurrentProviderProfile,
  updateCurrentProviderProfile,
} from '../../services/providerService';

export interface ProviderProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: (updated: ProviderProfileData) => void;
}

const COMMON_SKILLS = [
  'Waterproofing',
  'Roof repair',
  'Gutter cleaning',
  'Plumbing',
  'Pipe fitting',
  'Leak repair',
  'Tiling',
  'Drain cleaning',
  'Electrician',
  'Rewiring',
  'AC service',
  'HVAC maintenance',
  'Painting',
  'Wall waterproofing',
  'Appliance repair',
  'Washing machine service',
  'Refrigerator repair',
  'Chimney cleaning',
  'Pest control',
  'Gardening',
  'Pressure washing',
];

export const ProviderProfileModal: React.FC<ProviderProfileModalProps> = ({
  isOpen,
  onClose,
  onProfileUpdated,
}) => {
  const { user, token, logout } = useAuth();
  const [profile, setProfile] = useState<ProviderProfileData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form fields
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [experienceYears, setExperienceYears] = useState<number | ''>('');
  const [serviceArea, setServiceArea] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [city, setCity] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkillInput, setNewSkillInput] = useState('');

  const loadProfile = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchCurrentProviderProfile(token);
      setProfile(data);
      setDisplayName(data.displayName || '');
      setPhone(data.phone || '');
      setBio(data.bio || '');
      setExperienceYears(data.experienceYears !== undefined ? data.experienceYears : '');
      setServiceArea(data.serviceArea || '');
      setBusinessAddress(data.businessAddress || '');
      setCity(data.city || '');
      setSkills(data.skills || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load provider profile.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isOpen) {
      loadProfile();
      setSuccessMessage(null);
    }
  }, [isOpen, loadProfile]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleSkill = (skillName: string) => {
    setSkills((prev) =>
      prev.includes(skillName) ? prev.filter((s) => s !== skillName) : [...prev, skillName]
    );
  };

  const handleAddCustomSkill = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSkillInput.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills((prev) => [...prev, trimmed]);
      setNewSkillInput('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    // Client-side validations
    if (displayName.trim().length < 2 || displayName.trim().length > 100) {
      setErrorMessage('Display name must be between 2 and 100 characters.');
      return;
    }

    if (!/^[+]?[0-9\s-]{7,15}$/.test(phone.trim())) {
      setErrorMessage('Please provide a valid contact phone number (7 to 15 digits).');
      return;
    }

    if (serviceArea.trim().length < 2 || serviceArea.trim().length > 150) {
      setErrorMessage('Service area must be described in 2 to 150 characters.');
      return;
    }

    if (bio.trim().length > 1000) {
      setErrorMessage('Biography cannot exceed 1,000 characters.');
      return;
    }

    if (
      experienceYears !== '' &&
      (isNaN(Number(experienceYears)) ||
        Number(experienceYears) < 0 ||
        Number(experienceYears) > 60 ||
        !Number.isInteger(Number(experienceYears)))
    ) {
      setErrorMessage('Experience must be an integer between 0 and 60 years.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload: Partial<ProviderProfileData> = {
        displayName: displayName.trim(),
        phone: phone.trim(),
        bio: bio.trim() || undefined,
        experienceYears: experienceYears === '' ? undefined : Number(experienceYears),
        serviceArea: serviceArea.trim(),
        businessAddress: businessAddress.trim() || undefined,
        city: city.trim() || undefined,
        skills,
      };

      const updated = await updateCurrentProviderProfile(payload, token);
      setProfile(updated);
      setSuccessMessage('Business profile updated successfully!');
      onProfileUpdated?.(updated);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update provider profile.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dwellio-teal/60 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="provider-profile-modal-title"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-dwellio-mint/40 overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-dwellio-teal text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🛠️</span>
            <div>
              <h2 id="provider-profile-modal-title" className="text-lg font-bold">
                Provider Business Profile
              </h2>
              <p className="text-xs text-dwellio-mint/80">
                Manage your public specialist details, service areas, and trade qualifications
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Notification Banners */}
          {errorMessage && (
            <div
              className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold"
              role="alert"
            >
              ⚠️ {errorMessage}
            </div>
          )}

          {successMessage && (
            <div
              className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold"
              role="status"
            >
              ✓ {successMessage}
            </div>
          )}

          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-6 bg-slate-200 rounded w-1/3" />
              <div className="h-10 bg-slate-100 rounded-xl" />
              <div className="h-20 bg-slate-100 rounded-xl" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Reputation & Verification Status Summary (Read-Only) */}
              <div className="p-4 rounded-2xl bg-dwellio-ivory border border-dwellio-mint/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-dwellio-teal text-dwellio-mint font-bold flex items-center justify-center text-base">
                    {profile?.displayName?.charAt(0) || 'P'}
                  </div>
                  <div>
                    <span className="font-bold text-dwellio-teal block text-sm">
                      {profile?.displayName}
                    </span>
                    <span className="text-dwellio-teal/60">{user?.email}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <span>🛡️</span> Verified Specialist
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                    <span>⭐</span> {profile?.ratingAverage?.toFixed(1) || '0.0'} ({profile?.reviewCount || 0} reviews)
                  </span>
                </div>
              </div>

              {/* Business Name and Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="provider-display-name" className="block text-xs font-bold text-dwellio-teal mb-1">
                    Business / Display Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="provider-display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-dwellio-mint text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                    placeholder="e.g. Apex Electrical & Air Conditioning"
                  />
                </div>

                <div>
                  <label htmlFor="provider-phone" className="block text-xs font-bold text-dwellio-teal mb-1">
                    Contact Phone Number <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="provider-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-dwellio-mint text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                    placeholder="e.g. +91 98765 43210"
                  />
                </div>
              </div>

              {/* Bio & Experience */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="provider-bio" className="block text-xs font-bold text-dwellio-teal">
                    Professional Biography / About Your Business
                  </label>
                  <span className={`text-[10px] ${bio.length > 950 ? 'text-rose-600 font-bold' : 'text-dwellio-teal/60'}`}>
                    {bio.length} / 1000 characters
                  </span>
                </div>
                <textarea
                  id="provider-bio"
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={1000}
                  className="w-full px-3.5 py-2 rounded-xl border border-dwellio-mint text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal resize-y"
                  placeholder="Describe your expertise, certifications, guarantee, and standard workmanship..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="provider-experience" className="block text-xs font-bold text-dwellio-teal mb-1">
                    Experience (Years)
                  </label>
                  <input
                    id="provider-experience"
                    type="number"
                    min="0"
                    max="60"
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full px-3.5 py-2 rounded-xl border border-dwellio-mint text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                    placeholder="e.g. 8"
                  />
                </div>

                <div>
                  <label htmlFor="provider-city" className="block text-xs font-bold text-dwellio-teal mb-1">
                    Primary City
                  </label>
                  <input
                    id="provider-city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-dwellio-mint text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                    placeholder="e.g. Bengaluru"
                  />
                </div>

                <div>
                  <label htmlFor="provider-service-area" className="block text-xs font-bold text-dwellio-teal mb-1">
                    Service Area / Radius <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="provider-service-area"
                    type="text"
                    value={serviceArea}
                    onChange={(e) => setServiceArea(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-dwellio-mint text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                    placeholder="e.g. North Bengaluru & Whitefield"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="provider-business-address" className="block text-xs font-bold text-dwellio-teal mb-1">
                  Workshop / Registered Address
                </label>
                <input
                  id="provider-business-address"
                  type="text"
                  value={businessAddress}
                  onChange={(e) => setBusinessAddress(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-dwellio-mint text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                  placeholder="e.g. 142 Trade Center, Indiranagar"
                />
              </div>

              {/* Skills Management */}
              <div>
                <label className="block text-xs font-bold text-dwellio-teal mb-1.5">
                  Skills &amp; Service Qualifications ({skills.length} selected)
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2.5 bg-dwellio-ivory/50 rounded-2xl border border-dwellio-mint/60 mb-2">
                  {COMMON_SKILLS.map((sk) => {
                    const isSelected = skills.includes(sk);
                    return (
                      <button
                        key={sk}
                        type="button"
                        onClick={() => toggleSkill(sk)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                          isSelected
                            ? 'bg-dwellio-teal text-white shadow-xs'
                            : 'bg-white text-dwellio-teal/80 border border-dwellio-mint/70 hover:bg-dwellio-mint/20'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        {sk}
                      </button>
                    );
                  })}
                </div>

                {/* Custom skill input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSkillInput}
                    onChange={(e) => setNewSkillInput(e.target.value)}
                    placeholder="Add custom trade skill (e.g. Solar Inverter Setup)..."
                    className="flex-1 px-3 py-1.5 rounded-xl border border-dwellio-mint text-xs text-dwellio-teal focus:outline-none focus:ring-1 focus:ring-dwellio-teal"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomSkill}
                    disabled={!newSkillInput.trim()}
                    className="px-3.5 py-1.5 rounded-xl bg-dwellio-teal text-white font-bold text-xs disabled:opacity-40 hover:opacity-90 transition"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* Modal Action Bar */}
              <div className="flex items-center justify-between pt-4 border-t border-dwellio-mint/30">
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    onClose();
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition flex items-center gap-1.5"
                  title="Sign out of your provider account"
                >
                  <span>🚪</span>
                  <span>Sign Out</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 rounded-xl bg-[#D9653B] text-white text-xs font-bold hover:bg-[#c4562f] transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSaving ? 'Saving Changes...' : 'Save Profile'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

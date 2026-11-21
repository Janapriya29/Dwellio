import React, { useState, useEffect, useCallback } from 'react';
import { PlatformSettingsData, UpdatePlatformSettingsPayload } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import { fetchAdminSettings, updateAdminSettings } from '../../services/adminService';

export const AdminSettingsView: React.FC = () => {
  const { token } = useAuth();
  const [settings, setSettings] = useState<PlatformSettingsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form Fields
  const [commissionPercent, setCommissionPercent] = useState<number>(15);
  const [supportEmail, setSupportEmail] = useState<string>('support@dwellio.com');
  const [supportPhone, setSupportPhone] = useState<string>('+91 98765 43210');
  const [maintenanceEnabled, setMaintenanceEnabled] = useState<boolean>(false);
  const [maintenanceNotice, setMaintenanceNotice] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchAdminSettings(token);
      setSettings(data);
      setCommissionPercent(data.platformCommissionPercent);
      setSupportEmail(data.supportEmail);
      setSupportPhone(data.supportPhone);
      setMaintenanceEnabled(Boolean(data.emergencyMaintenanceNotice?.enabled));
      setMaintenanceNotice(data.emergencyMaintenanceNotice?.message || '');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load platform settings.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (commissionPercent < 0 || commissionPercent > 50) {
      setFormError('Commission percentage must be between 0% and 50%.');
      return;
    }
    if (!supportEmail.includes('@') || !supportEmail.includes('.')) {
      setFormError('A valid support email address is required.');
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const payload: UpdatePlatformSettingsPayload = {
        platformCommissionPercent: Number(commissionPercent),
        supportEmail: supportEmail.trim(),
        supportPhone: supportPhone.trim(),
        emergencyMaintenanceNotice: {
          enabled: maintenanceEnabled,
          message: maintenanceNotice.trim(),
        },
      };

      const updated = await updateAdminSettings(token, payload);
      setSettings(updated);
      setSuccessMessage('Platform parameters updated and audit logged successfully.');

      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update platform settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-dwellio-teal border-t-transparent mb-3" />
        <p className="text-xs text-dwellio-teal/70">Loading platform parameters...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-dwellio-teal flex items-center gap-2">
          <span>⚙️</span> Platform Settings &amp; Global Parameters
        </h2>
        <p className="text-xs text-dwellio-teal/70">
          Configure default platform commission fee rates, official contact channels, and emergency status notices.
        </p>
      </div>

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl shadow-xs">
          ✓ {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl shadow-xs">
          ✕ {errorMessage}
        </div>
      )}

      {/* Main Settings Card */}
      <div className="bg-white rounded-3xl border border-dwellio-mint/40 p-6 shadow-xs max-w-2xl space-y-6">
        {formError && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl">
            ✕ {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Commission Parameter */}
          <div>
            <label className="block text-xs font-bold text-dwellio-teal mb-1">
              Platform Commission Rate (%) *
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                max="50"
                step="0.5"
                required
                value={commissionPercent}
                onChange={(e) => setCommissionPercent(Number(e.target.value))}
                className="w-32 p-2.5 text-xs font-bold border border-dwellio-mint/60 rounded-xl focus:outline-hidden focus:border-dwellio-teal"
              />
              <span className="text-xs text-dwellio-teal/70 font-semibold">% of Gross Merchandise Value</span>
            </div>
            <p className="text-[11px] text-dwellio-teal/60 mt-1">
              Standard fee captured during booking creation. Valid range: 0% to 50%.
            </p>
          </div>

          {/* Support Email */}
          <div>
            <label className="block text-xs font-bold text-dwellio-teal mb-1">
              Official Support Email *
            </label>
            <input
              type="email"
              required
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="support@dwellio.com"
              className="w-full p-2.5 text-xs border border-dwellio-mint/60 rounded-xl focus:outline-hidden focus:border-dwellio-teal"
            />
            <p className="text-[11px] text-dwellio-teal/60 mt-1">
              Primary recipient for customer escalations and billing questions.
            </p>
          </div>

          {/* Support Phone */}
          <div>
            <label className="block text-xs font-bold text-dwellio-teal mb-1">
              Official Helpline / Phone *
            </label>
            <input
              type="text"
              required
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full p-2.5 text-xs border border-dwellio-mint/60 rounded-xl focus:outline-hidden focus:border-dwellio-teal"
            />
          </div>

          {/* Emergency Notice */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="maintenanceEnabled"
                checked={maintenanceEnabled}
                onChange={(e) => setMaintenanceEnabled(e.target.checked)}
                className="rounded border-dwellio-mint/60 text-dwellio-teal focus:ring-dwellio-teal"
              />
              <label htmlFor="maintenanceEnabled" className="text-xs font-bold text-dwellio-teal cursor-pointer">
                Enable Emergency Maintenance Advisory Banner
              </label>
            </div>
            <textarea
              rows={2}
              value={maintenanceNotice}
              onChange={(e) => setMaintenanceNotice(e.target.value)}
              placeholder="Leave blank unless active platform maintenance is underway..."
              className="w-full p-2.5 text-xs border border-dwellio-mint/60 rounded-xl focus:outline-hidden focus:border-dwellio-teal"
            />
            <p className="text-[11px] text-dwellio-teal/60">
              When enabled, this advisory banner displays across the customer and provider web portals.
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-dwellio-mint/30">
            <div className="text-[11px] text-dwellio-teal/60">
              {settings?.updatedAt && (
                <span>Last updated: {new Date(settings.updatedAt).toLocaleString()}</span>
              )}
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-dwellio-teal hover:bg-dwellio-teal/90 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
            >
              {isSaving ? 'Saving Parameters...' : 'Save Platform Parameters'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

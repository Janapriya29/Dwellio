import React, { useState, useEffect } from 'react';
import { CustomerSavedAddress } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import { updateUserProfile } from '../../services/authService';
import {
  getSavedAddresses,
  saveAddress,
  deleteAddress,
  setDefaultAddress,
} from '../../services/addressBookService';

export interface CustomerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CustomerProfileModal: React.FC<CustomerProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, token, updateUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'details' | 'addresses'>('details');

  // Profile details state
  const [name, setName] = useState<string>(user?.name || '');
  const [phone, setPhone] = useState<string>(user?.phone || '');
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);

  // Addresses state
  const [addresses, setAddresses] = useState<CustomerSavedAddress[]>([]);
  const [isAddingAddress, setIsAddingAddress] = useState<boolean>(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addrLabel, setAddrLabel] = useState<string>('Home');
  const [addrStreet, setAddrStreet] = useState<string>('');
  const [addrCity, setAddrCity] = useState<string>('');
  const [addrPostalCode, setAddrPostalCode] = useState<string>('');
  const [addrIsDefault, setAddrIsDefault] = useState<boolean>(false);
  const [addrError, setAddrError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone || '');
      setAddresses(getSavedAddresses(user.id));
    }
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErrorMsg(null);
    setProfileSuccessMsg(null);

    if (name.trim().length < 2) {
      setProfileErrorMsg('Display name must be at least 2 characters.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const updated = await updateUserProfile(
        {
          name: name.trim(),
          phone: phone.trim() || undefined,
        },
        token || ''
      );

      updateUser(updated);
      setProfileSuccessMsg('Profile information updated successfully.');
      setTimeout(() => setProfileSuccessMsg(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile.';
      setProfileErrorMsg(msg);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleStartAddAddress = () => {
    setEditingAddressId(null);
    setAddrLabel('Home');
    setAddrStreet('');
    setAddrCity('');
    setAddrPostalCode('');
    setAddrIsDefault(addresses.length === 0);
    setAddrError(null);
    setIsAddingAddress(true);
  };

  const handleStartEditAddress = (addr: CustomerSavedAddress) => {
    setEditingAddressId(addr.id);
    setAddrLabel(addr.label);
    setAddrStreet(addr.street);
    setAddrCity(addr.city);
    setAddrPostalCode(addr.postalCode || '');
    setAddrIsDefault(!!addr.isDefault);
    setAddrError(null);
    setIsAddingAddress(true);
  };

  const handleSaveAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAddrError(null);

    if (!addrStreet.trim() || !addrCity.trim()) {
      setAddrError('Street address and city are required.');
      return;
    }

    const updated = saveAddress(user.id, {
      id: editingAddressId || undefined,
      label: addrLabel,
      street: addrStreet,
      city: addrCity,
      postalCode: addrPostalCode.trim() || undefined,
      isDefault: addrIsDefault,
    });

    setAddresses(updated);
    setIsAddingAddress(false);
    setEditingAddressId(null);
  };

  const handleDeleteAddress = (id: string) => {
    const updated = deleteAddress(user.id, id);
    setAddresses(updated);
  };

  const handleSetDefault = (id: string) => {
    const updated = setDefaultAddress(user.id, id);
    setAddresses(updated);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dwellio-teal/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-dwellio-mint my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-dwellio-mint/40 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-dwellio-teal text-dwellio-mint flex items-center justify-center text-lg font-bold">
              👤
            </span>
            <div>
              <h3 id="profile-modal-title" className="text-xl font-black text-dwellio-teal">
                Account & Profile
              </h3>
              <p className="text-xs text-dwellio-teal/70">
                Manage your contact info and service addresses
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-dwellio-teal/50 hover:text-dwellio-teal p-1.5 rounded-xl hover:bg-dwellio-ivory transition"
            aria-label="Close profile modal"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-dwellio-ivory p-1 rounded-2xl border border-dwellio-mint/50 mb-5">
          <button
            type="button"
            onClick={() => {
              setActiveTab('details');
              setIsAddingAddress(false);
            }}
            className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition ${
              activeTab === 'details'
                ? 'bg-dwellio-teal text-white shadow-xs'
                : 'text-dwellio-teal/70 hover:text-dwellio-teal'
            }`}
          >
            Profile Info
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('addresses')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition ${
              activeTab === 'addresses'
                ? 'bg-dwellio-teal text-white shadow-xs'
                : 'text-dwellio-teal/70 hover:text-dwellio-teal'
            }`}
          >
            Saved Addresses ({addresses.length})
          </button>
        </div>

        {/* TAB 1: Profile Details */}
        {activeTab === 'details' && (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            {profileSuccessMsg && (
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                <span>✅</span>
                <span>{profileSuccessMsg}</span>
              </div>
            )}
            {profileErrorMsg && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span>{profileErrorMsg}</span>
              </div>
            )}

            <div>
              <label htmlFor="profile-email" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                Email Address (Read-only)
              </label>
              <input
                id="profile-email"
                type="email"
                value={user.email}
                disabled
                className="w-full rounded-xl border border-dwellio-mint/50 bg-slate-50 px-3.5 py-2.5 text-xs text-dwellio-teal/60 cursor-not-allowed font-medium"
              />
            </div>

            <div>
              <label htmlFor="profile-name" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                Display Name *
              </label>
              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3.5 py-2.5 text-xs text-dwellio-teal font-medium focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
              />
            </div>

            <div>
              <label htmlFor="profile-phone" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                Contact Phone
              </label>
              <input
                id="profile-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98400 12345"
                className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3.5 py-2.5 text-xs text-dwellio-teal font-medium focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
              />
              <span className="block text-[11px] text-dwellio-teal/60 mt-1">
                Technicians use this phone number for arrival coordination.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-dwellio-mint/30">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={isSavingProfile}
                className="px-5 py-2 rounded-xl bg-dwellio-teal text-white text-xs font-bold hover:bg-dwellio-teal/90 transition shadow-xs disabled:opacity-50"
              >
                {isSavingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: Address Book */}
        {activeTab === 'addresses' && (
          <div>
            {!isAddingAddress ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-dwellio-teal uppercase tracking-wider">
                    My Service Locations
                  </span>
                  <button
                    type="button"
                    onClick={handleStartAddAddress}
                    className="px-3 py-1.5 rounded-xl bg-dwellio-teal text-white text-xs font-bold hover:bg-dwellio-teal/90 transition shadow-xs flex items-center gap-1"
                  >
                    <span>＋</span>
                    <span>Add Address</span>
                  </button>
                </div>

                {addresses.length === 0 ? (
                  <div className="text-center py-8 px-4 rounded-2xl bg-dwellio-ivory/50 border border-dashed border-dwellio-mint/70 text-xs text-dwellio-teal/70">
                    <p className="font-bold text-dwellio-teal mb-1">No Saved Addresses</p>
                    <p>Add your home or office address for 1-click scheduling.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {addresses.map((addr) => (
                      <div
                        key={addr.id}
                        className="p-3.5 rounded-2xl bg-dwellio-ivory/60 border border-dwellio-mint/60 flex items-start justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold text-dwellio-teal">{addr.label}</span>
                            {addr.isDefault && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-dwellio-teal/80">
                            {addr.street}, {addr.city} {addr.postalCode ? `- ${addr.postalCode}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!addr.isDefault && (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(addr.id)}
                              className="text-[11px] text-dwellio-teal/70 hover:text-dwellio-teal font-semibold px-2 py-1 rounded hover:bg-white"
                            >
                              Make Default
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleStartEditAddress(addr)}
                            className="text-xs text-sky-700 hover:text-sky-900 font-bold p-1"
                            title="Edit address"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAddress(addr.id)}
                            className="text-xs text-rose-700 hover:text-rose-900 font-bold p-1"
                            title="Delete address"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSaveAddressSubmit} className="space-y-3">
                <div className="flex items-center justify-between border-b border-dwellio-mint/30 pb-2 mb-2">
                  <h4 className="text-xs font-bold text-dwellio-teal uppercase tracking-wider">
                    {editingAddressId ? 'Edit Address' : 'Add New Address'}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsAddingAddress(false)}
                    className="text-xs text-dwellio-teal/60 hover:text-dwellio-teal"
                  >
                    Back to List
                  </button>
                </div>

                {addrError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                    {addrError}
                  </div>
                )}

                <div>
                  <label htmlFor="addr-label-select" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                    Label
                  </label>
                  <div className="flex gap-2">
                    {['Home', 'Office', 'Apartment', 'Other'].map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setAddrLabel(l)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-xl border transition ${
                          addrLabel === l
                            ? 'bg-dwellio-teal text-white border-dwellio-teal'
                            : 'bg-dwellio-ivory text-dwellio-teal border-dwellio-mint/60'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="addr-street-input" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                    Street Address *
                  </label>
                  <input
                    id="addr-street-input"
                    type="text"
                    value={addrStreet}
                    onChange={(e) => setAddrStreet(e.target.value)}
                    required
                    placeholder="Door/Flat No., Street Name, Locality"
                    className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal font-medium focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="addr-city-input" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                      City *
                    </label>
                    <input
                      id="addr-city-input"
                      type="text"
                      value={addrCity}
                      onChange={(e) => setAddrCity(e.target.value)}
                      required
                      placeholder="E.g. Chennai"
                      className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal font-medium focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                    />
                  </div>
                  <div>
                    <label htmlFor="addr-postal-input" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-1">
                      Postal Code
                    </label>
                    <input
                      id="addr-postal-input"
                      type="text"
                      value={addrPostalCode}
                      onChange={(e) => setAddrPostalCode(e.target.value)}
                      placeholder="PIN / ZIP"
                      className="w-full rounded-xl border border-dwellio-mint/80 bg-white px-3 py-2 text-xs text-dwellio-teal font-medium focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="addr-default-check"
                    type="checkbox"
                    checked={addrIsDefault}
                    onChange={(e) => setAddrIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded text-dwellio-teal border-dwellio-mint focus:ring-dwellio-teal"
                  />
                  <label htmlFor="addr-default-check" className="text-xs text-dwellio-teal/80 font-medium">
                    Set as default address for future bookings
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-dwellio-mint/30">
                  <button
                    type="button"
                    onClick={() => setIsAddingAddress(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-dwellio-teal text-white text-xs font-bold hover:bg-dwellio-teal/90 transition shadow-xs"
                  >
                    Save Address
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

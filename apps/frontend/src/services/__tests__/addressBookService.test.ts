import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSavedAddresses,
  saveAddress,
  deleteAddress,
  setDefaultAddress,
  LEGACY_STORAGE_KEY,
  getStorageKey,
} from '../addressBookService';
import type { CustomerSavedAddress } from '@dwellio/shared';

describe('addressBookService — Multi-Address Book & Legacy Migration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('Legacy Address Migration & Shared Device Isolation', () => {
    it('successfully copies the legacy address to the correct user store', () => {
      const legacyAddress = {
        street: '12 Emerald Road',
        city: 'Chennai',
        postalCode: '600028',
      };
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyAddress));

      const userId = 'user-alice-101';
      const addresses = getSavedAddresses(userId);

      expect(addresses).toHaveLength(1);
      expect(addresses[0].street).toBe('12 Emerald Road');
      expect(addresses[0].city).toBe('Chennai');
      expect(addresses[0].postalCode).toBe('600028');
      expect(addresses[0].label).toBe('Home');
      expect(addresses[0].isDefault).toBe(true);

      // Verify persisted in user-specific key
      const stored = JSON.parse(localStorage.getItem(getStorageKey(userId)) || '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].street).toBe('12 Emerald Road');
    });

    it('removes the legacy key after successful migration', () => {
      localStorage.setItem(
        LEGACY_STORAGE_KEY,
        JSON.stringify({ street: '45 Lake View', city: 'Coimbatore', postalCode: '641001' })
      );

      const userId = 'user-bob-202';
      getSavedAddresses(userId);

      // Legacy key must be purged from localStorage
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    });

    it('does not overwrite an existing user-specific address book with legacy address', () => {
      const userId = 'user-charlie-303';
      const existingAddress: CustomerSavedAddress = {
        id: 'addr-existing-1',
        label: 'Office',
        street: '99 Tech Park',
        city: 'Bengaluru',
        postalCode: '560100',
        isDefault: true,
      };
      localStorage.setItem(getStorageKey(userId), JSON.stringify([existingAddress]));

      // Stale legacy key lingering from earlier session
      localStorage.setItem(
        LEGACY_STORAGE_KEY,
        JSON.stringify({ street: 'Old Legacy St', city: 'Old City' })
      );

      const addresses = getSavedAddresses(userId);

      expect(addresses).toHaveLength(1);
      expect(addresses[0].street).toBe('99 Tech Park');
      expect(addresses[0].label).toBe('Office');

      // Existing addresses were preserved intact
      const stored = JSON.parse(localStorage.getItem(getStorageKey(userId)) || '[]');
      expect(stored[0].street).toBe('99 Tech Park');
    });

    it('does not remove the legacy key if writing the migrated address fails', () => {
      const legacyData = { street: '77 Residency Rd', city: 'Madurai' };
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyData));

      // Simulate Storage QuotaExceededError or write failure
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });

      const userId = 'user-david-404';
      const addresses = getSavedAddresses(userId);

      // In-memory list is returned for UI fallback
      expect(addresses).toHaveLength(1);
      expect(addresses[0].street).toBe('77 Residency Rd');

      // Crucially, the legacy key must NOT be deleted if writing failed
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
      expect(JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '{}').street).toBe('77 Residency Rd');

      setItemSpy.mockRestore();
    });

    it('prevents a second user on a shared browser from inheriting the first user migrated legacy address', () => {
      // Step 1: Initial legacy address exists in browser storage
      localStorage.setItem(
        LEGACY_STORAGE_KEY,
        JSON.stringify({ street: '10 Marina Boulevard', city: 'Chennai', postalCode: '600001' })
      );

      // Step 2: User A logs in and retrieves addresses -> migrates legacy address
      const userA = 'user-alice-501';
      const userAAddresses = getSavedAddresses(userA);
      expect(userAAddresses).toHaveLength(1);
      expect(userAAddresses[0].street).toBe('10 Marina Boulevard');
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();

      // Step 3: User A logs out, User B logs in on the exact same browser/device
      const userB = 'user-bob-502';
      const userBAddresses = getSavedAddresses(userB);

      // User B must receive an empty address book and NOT inherit User A's address
      expect(userBAddresses).toEqual([]);
      expect(localStorage.getItem(getStorageKey(userB))).toBeNull();
    });

    it('returns an empty address book when no user addresses and no legacy address exist', () => {
      const addresses = getSavedAddresses('user-empty-601');
      expect(addresses).toEqual([]);
    });

    it('recovers gracefully from corrupted user-specific localStorage without throwing', () => {
      const userId = 'user-corrupted-701';
      localStorage.setItem(getStorageKey(userId), 'INVALID_JSON{broken');

      const addresses = getSavedAddresses(userId);
      expect(addresses).toEqual([]);
      // Corrupted key should have been removed
      expect(localStorage.getItem(getStorageKey(userId))).toBeNull();
    });

    it('recovers gracefully from malformed legacy address data without throwing', () => {
      localStorage.setItem(LEGACY_STORAGE_KEY, 'NOT_VALID_JSON{:::');

      const addresses = getSavedAddresses('user-legacy-bad-801');
      expect(addresses).toEqual([]);
    });
  });

  describe('Address Book CRUD & Default Address Integrity', () => {
    const userId = 'user-crud-901';

    it('adds new addresses and enforces default address uniqueness', () => {
      // First address becomes default automatically
      const list1 = saveAddress(userId, {
        label: 'Home',
        street: '1 First Cross',
        city: 'Chennai',
        postalCode: '600004',
      });
      expect(list1).toHaveLength(1);
      expect(list1[0].isDefault).toBe(true);

      // Second address added with isDefault: true must clear isDefault on first
      const list2 = saveAddress(userId, {
        label: 'Office',
        street: '2 Second Main',
        city: 'Chennai',
        postalCode: '600028',
        isDefault: true,
      });
      expect(list2).toHaveLength(2);
      expect(list2.find((a) => a.label === 'Office')?.isDefault).toBe(true);
      expect(list2.find((a) => a.label === 'Home')?.isDefault).toBe(false);
    });

    it('edits an existing address and updates default status', () => {
      const initial = saveAddress(userId, {
        label: 'Home',
        street: 'Original Street',
        city: 'Chennai',
      });
      const id = initial[0].id;

      const updated = saveAddress(userId, {
        id,
        label: 'Home Renovated',
        street: 'Updated Street',
        city: 'Chennai',
        isDefault: true,
      });

      expect(updated).toHaveLength(1);
      expect(updated[0].label).toBe('Home Renovated');
      expect(updated[0].street).toBe('Updated Street');
    });

    it('sets default address and promotes first remaining if default was deleted', () => {
      saveAddress(userId, { label: 'Addr1', street: 'Street 1', city: 'City' });
      saveAddress(userId, { label: 'Addr2', street: 'Street 2', city: 'City' });

      let list = getSavedAddresses(userId);
      const addr2Id = list.find((a) => a.label === 'Addr2')!.id;

      // Set Addr2 as default
      list = setDefaultAddress(userId, addr2Id);
      expect(list.find((a) => a.id === addr2Id)?.isDefault).toBe(true);
      expect(list.find((a) => a.label === 'Addr1')?.isDefault).toBe(false);

      // Delete Addr2 (which was default) -> Addr1 should automatically become default
      list = deleteAddress(userId, addr2Id);
      expect(list).toHaveLength(1);
      expect(list[0].label).toBe('Addr1');
      expect(list[0].isDefault).toBe(true);
    });
  });
});

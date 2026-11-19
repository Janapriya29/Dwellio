import { CustomerSavedAddress } from '@dwellio/shared';

export const LEGACY_STORAGE_KEY = 'dwellio_customer_address';

export const getStorageKey = (userId?: string): string => {
  return userId ? `dwellio_customer_saved_addresses_${userId}` : 'dwellio_customer_saved_addresses_guest';
};

/**
 * Retrieve saved addresses for a customer with automatic legacy migration.
 */
export const getSavedAddresses = (userId?: string): CustomerSavedAddress[] => {
  if (typeof window === 'undefined') return [];

  const key = getStorageKey(userId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item) =>
            item &&
            typeof item.id === 'string' &&
            typeof item.street === 'string' &&
            typeof item.city === 'string'
        );
      }
    }
  } catch {
    // Corrupted localStorage recovery: reset to empty array
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  // Legacy single address migration if no addresses exist for this user
  try {
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (legacy && legacy.street?.trim() && legacy.city?.trim()) {
        const migrated: CustomerSavedAddress = {
          id: `addr-legacy-${Date.now()}`,
          label: 'Home',
          street: legacy.street.trim(),
          city: legacy.city.trim(),
          postalCode: legacy.postalCode?.trim() || undefined,
          isDefault: true,
        };
        const list = [migrated];
        try {
          localStorage.setItem(key, JSON.stringify(list));
          try {
            localStorage.removeItem(LEGACY_STORAGE_KEY);
          } catch {
            // ignore removal errors if storage is locked
          }
        } catch {
          // If saving to user-specific key fails, do NOT remove the legacy key
        }
        return list;
      }
    }
  } catch {
    // ignore legacy parse errors
  }

  return [];
};

/**
 * Save (add or edit) an address in the user's address book.
 */
export const saveAddress = (
  userId: string | undefined,
  address: Omit<CustomerSavedAddress, 'id'> & { id?: string }
): CustomerSavedAddress[] => {
  if (typeof window === 'undefined') return [];

  const key = getStorageKey(userId);
  const current = getSavedAddresses(userId);

  const cleanStreet = address.street.trim();
  const cleanCity = address.city.trim();
  const cleanLabel = address.label.trim() || 'Home';
  const cleanPostalCode = address.postalCode?.trim() || undefined;

  let updatedList: CustomerSavedAddress[];

  if (address.id) {
    // Edit existing
    updatedList = current.map((item) => {
      if (item.id === address.id) {
        return {
          id: item.id,
          label: cleanLabel,
          street: cleanStreet,
          city: cleanCity,
          postalCode: cleanPostalCode,
          isDefault: address.isDefault ?? item.isDefault,
        };
      }
      return address.isDefault ? { ...item, isDefault: false } : item;
    });
  } else {
    // Add new
    const isFirst = current.length === 0;
    const isDefault = address.isDefault ?? isFirst;

    const newAddr: CustomerSavedAddress = {
      id: `addr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      label: cleanLabel,
      street: cleanStreet,
      city: cleanCity,
      postalCode: cleanPostalCode,
      isDefault,
    };

    const baseList = isDefault ? current.map((i) => ({ ...i, isDefault: false })) : current;
    updatedList = [...baseList, newAddr];
  }

  try {
    localStorage.setItem(key, JSON.stringify(updatedList));
  } catch {
    // ignore
  }

  return updatedList;
};

/**
 * Delete an address from the user's address book.
 */
export const deleteAddress = (
  userId: string | undefined,
  addressId: string
): CustomerSavedAddress[] => {
  if (typeof window === 'undefined') return [];

  const key = getStorageKey(userId);
  const current = getSavedAddresses(userId);
  let updatedList = current.filter((item) => item.id !== addressId);

  // If the deleted address was default and remaining addresses exist, set first as default
  const wasDefault = current.find((item) => item.id === addressId)?.isDefault;
  if (wasDefault && updatedList.length > 0 && !updatedList.some((i) => i.isDefault)) {
    updatedList[0].isDefault = true;
  }

  try {
    localStorage.setItem(key, JSON.stringify(updatedList));
  } catch {
    // ignore
  }

  return updatedList;
};

/**
 * Set an address as the default address.
 */
export const setDefaultAddress = (
  userId: string | undefined,
  addressId: string
): CustomerSavedAddress[] => {
  if (typeof window === 'undefined') return [];

  const key = getStorageKey(userId);
  const current = getSavedAddresses(userId);
  const updatedList = current.map((item) => ({
    ...item,
    isDefault: item.id === addressId,
  }));

  try {
    localStorage.setItem(key, JSON.stringify(updatedList));
  } catch {
    // ignore
  }

  return updatedList;
};

import { describe, it, expect } from 'vitest';
import { parseHashToTab } from '../../App';

describe('Hash Routing & Deep-Linking Parser (parseHashToTab)', () => {
  it('resolves #/bookings correctly to my-bookings', () => {
    expect(parseHashToTab('#/bookings')).toBe('my-bookings');
    expect(parseHashToTab('#/my-bookings')).toBe('my-bookings');
  });

  it('resolves #/bookings?bookingId=book-100 to my-bookings tab independently of query parameters', () => {
    expect(parseHashToTab('#/bookings?bookingId=book-100')).toBe('my-bookings');
    expect(parseHashToTab('#/my-bookings?bookingId=book-xyz-999&filter=all')).toBe('my-bookings');
  });

  it('resolves #/provider?bookingId=book-200 to provider-portal tab independently of query parameters', () => {
    expect(parseHashToTab('#/provider?bookingId=book-200')).toBe('provider-portal');
    expect(parseHashToTab('#/provider-portal?bookingId=book-200')).toBe('provider-portal');
  });

  it('preserves existing route mappings without query parameters', () => {
    expect(parseHashToTab('#/')).toBe('landing');
    expect(parseHashToTab('#/home')).toBe('landing');
    expect(parseHashToTab('#/discover')).toBe('discover');
    expect(parseHashToTab('#/services')).toBe('discover');
    expect(parseHashToTab('#/cutaway')).toBe('discover');
    expect(parseHashToTab('#/admin')).toBe('admin-dashboard');
    expect(parseHashToTab('#/admin-dashboard')).toBe('admin-dashboard');
    expect(parseHashToTab('')).toBe('landing');
  });

  it('preserves fallback behavior for invalid or unrecognized routes', () => {
    expect(parseHashToTab('#/unknown-route')).toBeNull();
    expect(parseHashToTab('#/invalid/path/test')).toBeNull();
  });
});

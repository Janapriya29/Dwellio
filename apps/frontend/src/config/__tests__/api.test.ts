import { describe, it, expect } from 'vitest';
import { API_BASE_URL, createApiUrl } from '../api';

describe('Frontend Centralized API Configuration (SEC-08)', () => {
  it('exports API_BASE_URL with sensible fallback', () => {
    expect(API_BASE_URL).toBeDefined();
    expect(typeof API_BASE_URL).toBe('string');
    // If no VITE_API_BASE_URL is set, it defaults to relative '/api'
    expect(API_BASE_URL.length).toBeGreaterThan(0);
  });

  it('createApiUrl produces valid URL instances for endpoints', () => {
    const url = createApiUrl('/catalog/categories');
    expect(url).toBeInstanceOf(URL);
    expect(url.pathname).toContain('/catalog/categories');
  });

  it('createApiUrl correctly handles endpoints without leading slash', () => {
    const url = createApiUrl('admin/overview');
    expect(url).toBeInstanceOf(URL);
    expect(url.pathname).toContain('/admin/overview');
  });

  it('createApiUrl supports query parameters via searchParams', () => {
    const url = createApiUrl('/catalog/services');
    url.searchParams.append('categoryId', 'cat123');
    url.searchParams.append('room', 'living');

    expect(url.searchParams.get('categoryId')).toBe('cat123');
    expect(url.searchParams.get('room')).toBe('living');
    expect(url.toString()).toContain('categoryId=cat123');
    expect(url.toString()).toContain('room=living');
  });
});

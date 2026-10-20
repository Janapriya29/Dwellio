/**
 * Centralized API configuration for Dwellio frontend.
 *
 * Uses VITE_API_BASE_URL (or VITE_API_URL) if explicitly defined in the environment.
 * Defaults to relative '/api', which is optimal for production deployments served behind
 * a reverse proxy (e.g., Nginx, Cloudflare, Docker routing /api to the Express backend).
 *
 * For local development without an explicit environment variable, Vite dev server proxies
 * '/api' to 'http://localhost:5000/api' as configured in vite.config.ts.
 */
const envApiUrl = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL) as string | undefined;

export const API_BASE_URL: string = envApiUrl ? envApiUrl.trim().replace(/\/+$/, '') : '/api';

/**
 * Creates a URL instance safely supporting both absolute base URLs
 * (e.g. 'http://localhost:5000/api') and relative base URLs (e.g. '/api')
 * across browser and Vitest jsdom environments.
 */
export const createApiUrl = (endpoint: string): URL => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullPath = `${API_BASE_URL}${cleanEndpoint}`;

  if (fullPath.startsWith('http://') || fullPath.startsWith('https://')) {
    return new URL(fullPath);
  }

  const base = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost:5173';

  return new URL(fullPath, base);
};

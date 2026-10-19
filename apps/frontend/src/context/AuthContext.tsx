import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SafeUser, ApiResponse, AuthResponseData } from '@dwellio/shared';

interface AuthContextType {
  user: SafeUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  switchDemoRole: (role: 'customer' | 'karthik' | 'naveen' | 'admin') => Promise<void>;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const DEMO_CREDENTIALS = import.meta.env.DEV
  ? {
      customer: {
        name: 'Pooja Sharma (Customer)',
        email: 'customer@example.com',
        password: 'DemoCustomer2026!',
        role: 'customer' as const,
      },
      karthik: {
        name: 'Karthik Raja (Roofing Provider)',
        email: 'karthik.roofing@example.com',
        password: 'DemoProvider2026!',
        role: 'provider' as const,
      },
      naveen: {
        name: 'Naveen Kumar (Electrical Provider)',
        email: 'naveen.electrical@example.com',
        password: 'DemoProvider2026!',
        role: 'provider' as const,
      },
      admin: {
        name: 'Dwellio Administrator',
        email: 'admin@dwellio.local',
        password: 'DwellioAdmin2026!',
        role: 'admin' as const,
      },
    }
  : undefined;

const DEFAULT_CUSTOMER_USER: SafeUser | null = import.meta.env.DEV
  ? {
      id: 'demo-customer-id',
      name: 'Pooja Sharma',
      email: 'customer@example.com',
      role: 'customer',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  : null;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SafeUser | null>(() => {
    const saved = localStorage.getItem('dwellio_user');
    return saved ? JSON.parse(saved) : DEFAULT_CUSTOMER_USER;
  });
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('dwellio_token') || (import.meta.env.DEV ? 'demo-customer-token' : null);
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const saveAuth = (newUser: SafeUser, newToken: string) => {
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem('dwellio_user', JSON.stringify(newUser));
    localStorage.setItem('dwellio_token', newToken);
  };

  const clearAuth = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('dwellio_user');
    localStorage.removeItem('dwellio_token');
  };

  const login = async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const json: ApiResponse<AuthResponseData> = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Login failed');
      }

      saveAuth(json.data.user, json.data.token);
    } finally {
      setIsLoading(false);
    }
  };

  const switchDemoRole = useCallback(async (roleKey: 'customer' | 'karthik' | 'naveen' | 'admin'): Promise<void> => {
    if (!import.meta.env.DEV || !DEMO_CREDENTIALS) {
      console.warn('Demo persona switching is disabled in production.');
      return;
    }
    const creds = DEMO_CREDENTIALS[roleKey];
    if (!creds) return;
    try {
      await login(creds.email, creds.password);
    } catch {
      // Fallback local mock user if backend is offline during isolated UI tests
      const fallbackUser: SafeUser = {
        id: `mock-${roleKey}-id`,
        name: creds.name,
        email: creds.email,
        role: creds.role,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveAuth(fallbackUser, `mock-token-${roleKey}`);
    }
  }, []);

  // Initialize with demo customer in development mode if no session exists
  useEffect(() => {
    if (import.meta.env.DEV && !token) {
      switchDemoRole('customer').catch(() => {});
    }
  }, [token, switchDemoRole]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        isLoading,
        login,
        logout: clearAuth,
        switchDemoRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

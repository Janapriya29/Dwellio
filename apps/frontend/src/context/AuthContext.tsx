import React, { createContext, useContext, useState, useCallback } from 'react';
import { SafeUser } from '@dwellio/shared';
import { loginUser, registerCustomer } from '../services/authService';

export interface DemoCredentialItem {
  name: string;
  email: string;
  password: string;
  role: 'customer' | 'provider' | 'admin';
}

interface AuthContextType {
  user: SafeUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<SafeUser>;
  register: (name: string, email: string, password: string) => Promise<SafeUser>;
  logout: () => void;
  switchDemoRole: (role: 'customer' | 'karthik' | 'naveen' | 'admin') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const DEMO_CREDENTIALS: Record<string, DemoCredentialItem> | undefined = import.meta.env.DEV
  ? {
      customer: {
        name: 'Pooja Sharma (Customer)',
        email: 'customer@example.com',
        password: 'DemoCustomer2026!',
        role: 'customer',
      },
      karthik: {
        name: 'Karthik Raja (Roofing Provider)',
        email: 'karthik.roofing@example.com',
        password: 'DemoProvider2026!',
        role: 'provider',
      },
      naveen: {
        name: 'Naveen Kumar (Electrical Provider)',
        email: 'naveen.electrical@example.com',
        password: 'DemoProvider2026!',
        role: 'provider',
      },
      admin: {
        name: 'Dwellio Administrator',
        email: 'admin@dwellio.local',
        password: 'DwellioAdmin2026!',
        role: 'admin',
      },
    }
  : undefined;

const DEFAULT_CUSTOMER_USER: SafeUser = {
  id: 'demo-customer-id',
  name: 'Pooja Sharma',
  email: 'customer@example.com',
  role: 'customer',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isTestEnv = import.meta.env.MODE === 'test';

  const [user, setUser] = useState<SafeUser | null>(() => {
    try {
      const saved = localStorage.getItem('dwellio_user');
      if (saved) return JSON.parse(saved);
      if (isTestEnv) return DEFAULT_CUSTOMER_USER;
      return null;
    } catch {
      return isTestEnv ? DEFAULT_CUSTOMER_USER : null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    const saved = localStorage.getItem('dwellio_token');
    if (saved) return saved;
    if (isTestEnv) return 'demo-customer-token';
    return null;
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

  const login = async (email: string, password: string): Promise<SafeUser> => {
    setIsLoading(true);
    try {
      const authData = await loginUser({ email, password });
      saveAuth(authData.user, authData.token);
      return authData.user;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string): Promise<SafeUser> => {
    setIsLoading(true);
    try {
      const authData = await registerCustomer({ name, email, password });
      saveAuth(authData.user, authData.token);
      return authData.user;
    } finally {
      setIsLoading(false);
    }
  };

  const switchDemoRole = useCallback(
    async (roleKey: 'customer' | 'karthik' | 'naveen' | 'admin'): Promise<void> => {
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
    },
    []
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        register,
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

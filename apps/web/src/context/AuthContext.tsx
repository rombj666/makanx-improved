import { resetVendorSession, VENDOR_SESSION_EXPIRED } from '../lib/vendorSession';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Role } from '@smart-qr/shared';

interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  vendorProfile?: {
    id: string;
    slug?: string;
    businessName?: string;
  };
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: User) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const onSessionExpired = () => { setUser(null); setIsLoading(false); };
    window.addEventListener(VENDOR_SESSION_EXPIRED, onSessionExpired);
    const checkAuth = async () => {
      try {
        const { data } = await api.get('/auth/me');
        if (isMounted && data.success) setUser(data.data);
      } catch (error: any) {
        if (!isMounted) return;
        const status = error.response?.status;
        if (status !== 401 && status !== 429) console.error('Authentication check failed');
      }
      if (isMounted) setIsLoading(false);
    };
    checkAuth();
    return () => { isMounted = false; window.removeEventListener(VENDOR_SESSION_EXPIRED, onSessionExpired); };
  }, []);

  const login = (user: User) => {
    resetVendorSession();
    setUser(user);
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* Local state still ends. */ }
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

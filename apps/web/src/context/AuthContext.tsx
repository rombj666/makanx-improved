import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Role } from '@makanx/shared';

interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  vendorProfile?: {
    id: string;
    businessName?: string;
  };
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const { data } = await api.get('/auth/me');
          if (isMounted && data.success) {
            console.log('Logged in user (/auth/me):', data.data);
            setUser(data.data);
          }
        } catch (error: any) {
          if (!isMounted) return;
          const status = error.response?.status;
          // Only remove token on 401/403.
          // Do NOT remove on 429 (Too Many Requests) or network errors.
          if (status === 401 || status === 403) {
            console.warn('Auth failed, removing token:', status);
            localStorage.removeItem('token');
            setUser(null);
          } else if (status === 429) {
            console.error('Rate limited on auth check. Keeping token but limiting further checks.');
          } else {
            console.error('Auth check error (kept token):', status || error.message);
          }
        }
      }
      if (isMounted) setIsLoading(false);
    };
    checkAuth();
    return () => { isMounted = false; };
  }, []);

  const login = (token: string, user: User) => {
    localStorage.setItem('token', token);
    console.log('Logged in user (login):', user);
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('token');
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

'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { login as apiLogin, getMe, logout as apiLogout } from '@/lib/api';

interface User {
  username: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading] = useState(false);

  const login = useCallback(async (username: string, password: string) => {
    await apiLogin(username, password);
    const me = await getMe();
    setUser(me);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    apiLogout();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

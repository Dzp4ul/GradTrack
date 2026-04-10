import React, { createContext, useContext, useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../config/api';

export interface GraduateUser {
  account_id: number;
  graduate_id: number;
  email: string;
  full_name: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  student_id?: string | null;
  phone?: string | null;
  year_graduated?: number | null;
  address?: string | null;
  program_id?: number | null;
  program_name?: string | null;
  program_code?: string | null;
  profile_image_path?: string | null;
  role: 'graduate';
}

interface GraduateAuthContextType {
  user: GraduateUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<GraduateUser>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const GraduateAuthContext = createContext<GraduateAuthContextType | undefined>(undefined);

export function GraduateAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<GraduateUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.GRADUATE_AUTH.CHECK, {
        method: 'GET',
        credentials: 'include',
      });
      const data = await response.json();

      if (data.authenticated && data.user) {
        setUser(data.user as GraduateUser);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Graduate auth check failed:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await fetch(API_ENDPOINTS.GRADUATE_AUTH.LOGIN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (!response.ok || !data.success || !data.user) {
      throw new Error(data.error || 'Graduate login failed');
    }

    const authenticatedUser = data.user as GraduateUser;
    setUser(authenticatedUser);
    return authenticatedUser;
  };

  const logout = async () => {
    try {
      await fetch(API_ENDPOINTS.GRADUATE_AUTH.LOGOUT, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Graduate logout failed:', error);
    } finally {
      setUser(null);
    }
  };

  return (
    <GraduateAuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </GraduateAuthContext.Provider>
  );
}

export function useGraduateAuth() {
  const context = useContext(GraduateAuthContext);
  if (!context) {
    throw new Error('useGraduateAuth must be used inside GraduateAuthProvider');
  }
  return context;
}

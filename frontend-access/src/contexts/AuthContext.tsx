import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Profile } from '@/types';
import {
  authRequest,
  clearAuthSession,
  loginWithEmail,
  logoutCurrentSession,
} from '@/services/authApi';

// Simple user interface for our local auth
export interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signInWithUsername: (username: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithUsername: (username: string, password: string) => Promise<{ error: Error | null }>; // Placeholder
  signOut: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing token and validate it
    const token = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');

    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        
        // Validate token by making a test request
        authRequest<{ id: string }>('/auth/me')
          .then(() => {
            setUser(parsedUser);
            fetchProfile(parsedUser.id);
          })
          .catch(() => {
            // Token invalid, clear session
            console.warn("Token validation failed, clearing session");
            clearAuthSession();
          })
          .finally(() => {
            setLoading(false);
          });
      } catch (e) {
        console.error("Failed to parse stored user", e);
        clearAuthSession();
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;
      const data = await authRequest<Profile>(`/profiles/${userId}`);
      setProfile(data);
    } catch (e) {
      console.error("Failed to fetch profile", e);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const signInWithUsername = async (username: string, password: string) => {
    try {
      // Use email login for now as backend expects email
      const email = username;

      const { user } = await loginWithEmail(email, password);
      setUser(user);

      // Fetch profile
      await fetchProfile(user.id);

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  // Placeholder implementation
  const signUpWithUsername = async (_username: string, _password: string) => {
    console.warn("Signup not implemented in local version yet");
    return { error: new Error("Signup disabled in local mode") };
  };

  const signOut = () => {
    logoutCurrentSession().catch(() => undefined);
    clearAuthSession();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signInWithUsername, signUpWithUsername, signOut, refreshProfile }}>
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

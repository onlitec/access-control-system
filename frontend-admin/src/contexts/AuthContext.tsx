import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { clearStoredAuth, login as apiLogin, logoutCurrentSession } from '@/services/api';

interface User {
    id?: string;
    email: string;
    name: string;
    role: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const savedToken = localStorage.getItem('admin_token');
        const savedUser = localStorage.getItem('admin_user');
        if (savedToken && savedUser) {
            setToken(savedToken);
            try {
                setUser(JSON.parse(savedUser));
            } catch {
                clearStoredAuth();
            }
        }
        setIsLoading(false);
    }, []);

    const login = async (email: string, password: string) => {
        const result = await apiLogin(email, password);
        setToken(result.token);
        setUser(result.user);
    };

    const logout = () => {
        logoutCurrentSession().catch(() => undefined);
        setToken(null);
        setUser(null);
        clearStoredAuth();
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            isAuthenticated: !!token,
            isLoading,
            login,
            logout,
        }}>
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

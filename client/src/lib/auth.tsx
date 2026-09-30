import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiError, type User, authApi } from './api';

interface AuthContextValue {
  user: User | null;
  /** True until the first /auth/me round trip settles. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName?: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the current user.
 *
 * The session itself lives in an httpOnly cookie, so there is nothing to keep
 * in localStorage and nothing for JS to leak. On mount we ask the server who we
 * are; a 401 simply means "not signed in" and is not an error worth surfacing.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { user: me } = await authApi.me();
        if (!cancelled) setUser(me);
      } catch (error) {
        if (!cancelled && !(error instanceof ApiError && error.isUnauthorized)) {
          console.error('Failed to load session:', error);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: next } = await authApi.login(email, password);
    setUser(next);
  }, []);

  const signup = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const { user: next } = await authApi.signup(email, password, displayName);
      setUser(next);
    },
    [],
  );

  const continueAsGuest = useCallback(async () => {
    const { user: next } = await authApi.guest();
    setUser(next);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, signup, continueAsGuest, logout }),
    [user, isLoading, login, signup, continueAsGuest, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}

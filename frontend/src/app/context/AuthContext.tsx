import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { API_BASE, apiFetch } from "../../lib/api";

export interface AuthUser {
  id: string;
  displayName: string;
  handle: string;
  email: string;
  isBot: boolean;
  botLabel: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  /** True when /api/auth/me failed for a non-auth reason (e.g. network); session may still exist. */
  authError: boolean;
  retryAuthCheck: () => Promise<void>;
  register: (displayName: string, handle: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  const loadMe = useCallback(async () => {
    setAuthError(false);
    setIsLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/api/auth/me`);
      if (r.status === 401 || r.status === 403) {
        setUser(null);
        return;
      }
      if (!r.ok) {
        setAuthError(true);
        return;
      }
      const data = (await r.json()) as { user?: AuthUser | null };
      setUser(data.user ?? null);
    } catch {
      setAuthError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  async function register(displayName: string, handle: string, email: string, password: string) {
    const res = await apiFetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, handle, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Registration failed");
    setAuthError(false);
    setUser(data.user);
  }

  async function login(email: string, password: string) {
    const res = await apiFetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Login failed");
    setAuthError(false);
    setUser(data.user);
  }

  async function logout() {
    await apiFetch(`${API_BASE}/api/auth/logout`, { method: "POST" });
    setAuthError(false);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        authError,
        retryAuthCheck: loadMe,
        register,
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
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

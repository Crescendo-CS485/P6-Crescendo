import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
  register: (displayName: string, handle: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const STORAGE_KEY = "crescendo_user";

function loadStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function persistUser(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialise from localStorage so the UI survives refresh; GET /api/auth/me reconciles with the server.
  const [user, setUser] = useState<AuthUser | null>(loadStoredUser);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Reconcile with Flask session (requires apiFetch credentials: "include").
    apiFetch(`${API_BASE}/api/auth/me`)
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          // Real session exists — use it as the source of truth
          setUser(data.user);
          persistUser(data.user);
        } else {
          setUser(null);
          persistUser(null);
        }
      })
      .catch(() => {/* network error — keep stored user */})
      .finally(() => setIsLoading(false));
  }, []);

  function setAndPersist(u: AuthUser | null) {
    setUser(u);
    persistUser(u);
  }

  async function register(displayName: string, handle: string, email: string, password: string) {
    const res = await apiFetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, handle, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Registration failed");
    setAndPersist(data.user);
  }

  async function login(email: string, password: string) {
    const res = await apiFetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Login failed");
    setAndPersist(data.user);
  }

  async function logout() {
    await apiFetch(`${API_BASE}/api/auth/logout`, { method: "POST" });
    setAndPersist(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

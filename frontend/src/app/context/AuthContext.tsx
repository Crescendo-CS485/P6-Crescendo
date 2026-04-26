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

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiFetch(`${API_BASE}/api/auth/me`)
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function register(displayName: string, handle: string, email: string, password: string) {
    const res = await apiFetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, handle, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Registration failed");
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
    setUser(data.user);
  }

  async function logout() {
    await apiFetch(`${API_BASE}/api/auth/logout`, { method: "POST" });
    setUser(null);
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

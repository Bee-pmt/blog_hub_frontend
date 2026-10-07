"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ApiError,
  errorMessage,
  request,
  TokenResponse,
  User,
} from "@/lib/api";
import {
  authenticatedRequest,
  clearSession,
  refreshSession,
  sessionLock,
  setSession,
} from "@/lib/session";
type Auth = {
  user: User | null;
  loading: boolean;
  error: string;
  restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
};
const AuthContext = createContext<Auth | null>(null);
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider is required");
  return auth;
}
export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const channel = useRef<BroadcastChannel | null>(null);
  const restoreId = useRef(0);
  const restore = useCallback(async () => {
    const id = ++restoreId.current;
    setLoading(true);
    setError("");
    try {
      await refreshSession();
      const profile = await authenticatedRequest<User>("/auth/me");
      if (id === restoreId.current) setUser(profile);
    } catch (failure) {
      if (id !== restoreId.current) return;
      if (failure instanceof ApiError && failure.status === 401) {
        clearSession();
        setUser(null);
      } else setError(errorMessage(failure));
    } finally {
      if (id === restoreId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    // Restore the cookie session on mount before showing account controls.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restore();
    if (typeof BroadcastChannel !== "undefined") {
      const current = new BroadcastChannel("bloghub-session");
      channel.current = current;
      current.onmessage = (event) => {
        if (event.data === "logout") {
          restoreId.current++;
          clearSession();
          setUser(null);
          setLoading(false);
          setError("");
        }
        if (event.data === "login") void restore();
      };
      return () => {
        current.close();
        channel.current = null;
      };
    }
  }, [restore]);
  const api = useCallback(async <T,>(path: string, options?: RequestInit) => {
    try {
      return await authenticatedRequest<T>(path, options);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        clearSession();
        setUser(null);
      }
      throw failure;
    }
  }, []);
  async function login(email: string, password: string) {
    ++restoreId.current;
    await sessionLock(async () => {
      const data = await request<TokenResponse>("/auth/login", {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      clearSession();
      setSession(data);
      setUser(await authenticatedRequest<User>("/auth/me"));
    });
    setLoading(false);
    setError("");
    channel.current?.postMessage("login");
  }
  async function logout() {
    await sessionLock(() =>
      request<void>("/auth/logout", { method: "POST", credentials: "include" }),
    );
    ++restoreId.current;
    clearSession();
    setUser(null);
    setError("");
    try {
      for (const key of Object.keys(localStorage))
        if (key.startsWith(`bloghub-recovery:${user?.id}:`))
          localStorage.removeItem(key);
    } catch {
      /* Storage can be unavailable. */
    }
    channel.current?.postMessage("logout");
  }
  return (
    <AuthContext.Provider
      value={{ user, loading, error, restore, login, logout, api }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function AccountNav() {
  const { user, loading, logout } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (loading)
    return (
      <span className="muted" aria-live="polite">
        Account…
      </span>
    );
  if (!user) return <Link href="/login">Sign in</Link>;
  return (
    <>
      <Link href="/dashboard">Dashboard</Link>
      <button
        className="nav-button"
        data-leave-editor
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await logout();
          } catch (failure) {
            setError(errorMessage(failure));
          } finally {
            setBusy(false);
          }
        }}
      >
        Sign out
      </button>
      {error && (
        <span role="alert" className="nav-error">
          {error}
        </span>
      )}
    </>
  );
}

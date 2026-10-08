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
  User,
} from "@/lib/api";
import {
  authenticatedRequest,
  clearSession,
  refreshSession,
  sessionLock,
  setSession,
} from "@/lib/session";
import { submitAuthAction, logoutAction } from "@/action/action";
type Auth = {
  user: User | null;
  loading: boolean;
  error: string;
  restore: () => Promise<void>;
  login: (form: FormData) => Promise<void>;
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
  
  async function login(form: FormData) {
    ++restoreId.current;
    await sessionLock(async () => {
      const result = await submitAuthAction("login", form);
      if (!result.data) throw new ApiError(result.error, result.status);
      const data = result.data;
      clearSession();
      setSession(data);
      setUser(await authenticatedRequest<User>("/auth/me"));
    });
    setLoading(false);
    setError("");
    channel.current?.postMessage("login");
  }
  async function logout() {
    await sessionLock(async () => {
      const result = await logoutAction();
      if (result.error) throw new ApiError(result.error, result.status);
    });
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
  const { user } = useAuth();
  if (!user)
    return (
      <Link
        className="nav-account-button"
        href="/login"
        aria-label="Sign in"
        title="Sign in"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </svg>
      </Link>
    );
  return (
    <>
      <Link
        className="nav-account-button"
        href="/dashboard"
        aria-label="Profile"
        title={user.displayName}
      >
        <span aria-hidden="true">
          {Array.from(user.displayName.trim())[0]?.toLocaleUpperCase() || "U"}
        </span>
      </Link>
    </>
  );
}

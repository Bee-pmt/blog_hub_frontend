"use client";

import type { AuthStore, ChildrenProps } from "@/type/type";
import { createContext, useContext, useEffect, useState } from "react";
import { useStore } from "zustand";
import Link from "next/link";
import { createAuthStore } from "@/store/auth-store";

const AuthContext = createContext<AuthStore | null>(null);

export function useAuth() {
  const store = useContext(AuthContext);
  if (!store) throw new Error("AuthProvider is required");
  return useStore(store);
}

export default function AuthProvider({ children }: ChildrenProps) {
  const [store] = useState(createAuthStore);
  useEffect(() => store.getState().initialize(), [store]);
  return <AuthContext.Provider value={store}>{children}</AuthContext.Provider>;
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

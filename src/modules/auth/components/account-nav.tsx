"use client";
import Link from "next/link";
import { useAuth } from "@/modules/auth/hooks/useAuth";

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

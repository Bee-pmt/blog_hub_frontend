"use client";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { errorMessage } from "@/lib/api";
export default function DashboardShell({ children }: { children: ReactNode }) {
  const { user, loading, error, restore, logout } = useAuth(
    useShallow((state) => ({
      user: state.user,
      loading: state.loading,
      error: state.error,
      restore: state.restore,
      logout: state.logout,
    })),
  );
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const admin = pathname.startsWith("/dashboard/admin");
  useEffect(() => {
    if (!loading && !error && !user)
      router.replace(
        `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
  }, [loading, error, user, router]);
  if (loading)
    return (
      <main
        id="main-content"
        className="site-container loading-state"
        role="status"
      >
        Opening your workspace…
      </main>
    );
  if (error)
    return (
      <main id="main-content" className="site-container empty-state">
        <h1>Unable to restore your session.</h1>
        <p role="alert">{error}</p>
        <button
          className="button button-primary"
          onClick={() => void restore()}
        >
          Try again
        </button>
        <Link className="text-link" href="/login">
          Sign in
        </Link>
      </main>
    );
  if (!user)
    return (
      <main
        id="main-content"
        className="site-container loading-state"
        role="status"
      >
        Taking you to sign in…
      </main>
    );
  if (admin && user.role !== "admin")
    return (
      <main id="main-content" className="site-container empty-state">
        <h1>This workspace is for admins.</h1>
        <Link className="button button-secondary" href="/dashboard">
          Your posts
        </Link>
      </main>
    );
  return (
    <main id="main-content" className="site-container dashboard-layout">
      <aside className="dashboard-sidebar">
        <p className="eyebrow">Your workspace</p>
        <div className="sidebar-account-heading">
          <h2>{user.displayName}</h2>
          <Link
            className="sidebar-settings-button"
            href="/settings"
            aria-label="Account settings"
            title="Change password"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="m9 3-.6 2.4-2.1 1.2-2.4-.6-2 3.5 1.8 1.7v2.4L1.9 15l2 3.5 2.4-.6 2.1 1.2L9 21h4l.6-2.4 2.1-1.2 2.4.6 2-3.5-1.8-1.7v-2.4L20.1 9l-2-3.5-2.4.6-2.1-1.2L13 3Z" />
              <circle cx="11" cy="12" r="3" />
            </svg>
          </Link>
        </div>
        <nav aria-label="Workspace navigation">
          <Link
            aria-current={pathname === "/dashboard" ? "page" : undefined}
            href="/dashboard"
          >
            My stories
          </Link>
          <Link
            aria-current={
              pathname === "/dashboard/posts/new" ? "page" : undefined
            }
            href="/dashboard/posts/new"
          >
            Write a story
          </Link>
          <Link
            aria-current={
              pathname === "/dashboard/taxonomy" ? "page" : undefined
            }
            href="/dashboard/taxonomy"
          >
            Categories & tags
          </Link>
          {user.role === "admin" && (
            <>
              <Link
                aria-current={
                  pathname.startsWith("/dashboard/admin/posts")
                    ? "page"
                    : undefined
                }
                href="/dashboard/admin/posts"
              >
                All stories · Admin
              </Link>
              <Link
                href="/dashboard/admin/users"
                aria-current={
                  pathname === "/dashboard/admin/users" ? "page" : undefined
                }
              >
                Users · Admin
              </Link>
            </>
          )}
        </nav>
        <div className="account-details">
          <p>{user.email}</p>
          <p>{user.role === "admin" ? "Administrator" : "Author"}</p>
        </div>
        <div className="workspace-signout">
          <button
            className="button button-secondary"
            data-leave-editor
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              setLogoutError("");
              try {
                await logout();
                toast.success("Signed out successfully.");
              } catch (failure) {
                setLogoutError(errorMessage(failure));
                toast.error(errorMessage(failure));
              } finally {
                setSigningOut(false);
              }
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          {logoutError && (
            <p className="notice" role="alert">
              {logoutError}
            </p>
          )}
        </div>
      </aside>
      <div className="dashboard-content">{children}</div>
    </main>
  );
}

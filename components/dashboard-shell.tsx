"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { errorMessage } from "@/lib/api";
export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, error, restore, logout } = useAuth();
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
        <h2>{user.displayName}</h2>
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
            <Link
              aria-current={admin ? "page" : undefined}
              href="/dashboard/admin/posts"
            >
              All stories · Admin
            </Link>
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
          {logoutError && <p className="notice" role="alert">{logoutError}</p>}
        </div>
      </aside>
      <div className="dashboard-content">{children}</div>
    </main>
  );
}

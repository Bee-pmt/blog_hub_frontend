"use client";
import { hasPermission } from "@/modules/auth/permissions";
import type { ModuleNavItem } from "@/moduleTypes";
import type { ReactNode } from "react";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { errorMessage } from "@/lib/api-client";
import { UnreadChatBadge } from "@/modules/chat/components/chat-provider";
import NotificationBell from "@/modules/notifications/components/notification-bell";
export default function DashboardShell({
  children,
  permission,
}: {
  children: ReactNode;
  permission?: string;
}) {
  const { user, loading, error, restore } = useAuth();
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
  if ((permission && !hasPermission(user, permission)) || (admin && !permission))
    return (
      <main id="main-content" className="site-container empty-state">
        <h1>You do not have permission to open this workspace.</h1>
        <Link className="button button-secondary" href="/dashboard">
          Your posts
        </Link>
      </main>
    );
  return (
    <main id="main-content" className="site-container dashboard-layout dashboard-drawer-layout">
      <div className="dashboard-content">{children}</div>
    </main>
  );
}

export function WorkspaceSidebar({ navItems }: { navItems: ModuleNavItem[] }) {
  const { user, loading, error, restore, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const pathname = usePathname();

  return (
    <aside className="dashboard-sidebar workspace-sidebar" aria-label="Sidebar">
        {loading ? <p role="status">Checking your session…</p> : error ? (
          <p className="notice" role="alert">{error}{" "}<button className="text-link" onClick={() => void restore()}>Retry session check</button></p>
        ) : user ? (
          <>
            <p className="eyebrow">Your workspace</p>
            <div className="sidebar-account-heading">
              <h2>{user.displayName}</h2>
              <div className="sidebar-account-actions">
                <NotificationBell key={user.id} />
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
            </div>
            <nav aria-label="Workspace navigation">
              {navItems
                .filter((item) => item.permission ? hasPermission(user, item.permission) : !item.admin)
                .map((item) => (
                  <Link
                    key={item.href}
                    className={item.href === "/dashboard/chat" ? "workspace-chat-link" : undefined}
                    href={item.href}
                    aria-current={
                      pathname === item.href ||
                      (item.admin && pathname.startsWith(item.href))
                        ? "page"
                        : undefined
                    }
                  >
                    {item.label}
                    {item.href === "/dashboard/chat" && <UnreadChatBadge />}
                  </Link>
                ))}
            </nav>
            <div className="account-details">
              <p>{user.email}</p>
              <p>{user.role === "super_admin" ? "Super administrator" : user.role === "admin" ? "Administrator" : "Author"}</p>
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
          </>
        ) : (
          <nav aria-label="Account navigation">
            <Link href="/login">Log in</Link>
            <Link href="/register">Sign up</Link>
          </nav>
        )}
    </aside>
  );
}

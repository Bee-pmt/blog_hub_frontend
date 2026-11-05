"use client";
import { hasPermission } from "@/modules/auth/permissions";
import type { ModuleNavItem } from "@/moduleTypes";
import type { ReactNode } from "react";

import { useEffect, useId, useRef, useState } from "react";
import {
  LayoutGrid, BookOpen, SquarePen, History, Tags, MessagesSquare,
  Trash2, Library, UsersRound, ChevronDown, LogOut, Settings, UserRound,
  type LucideIcon,
} from "lucide-react";
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

const navigation: Record<string, { label: string; icon: LucideIcon }> = {
  "/dashboard": { label: "My Stories", icon: BookOpen },
  "/dashboard/posts/new": { label: "Write a Story", icon: SquarePen },
  "/dashboard/activity": { label: "My Activity", icon: History },
  "/dashboard/taxonomy": { label: "Categories & Tags", icon: Tags },
  "/dashboard/chat": { label: "Messages", icon: MessagesSquare },
  "/dashboard/trash": { label: "My Trash", icon: Trash2 },
  "/dashboard/admin/posts": { label: "All Stories", icon: Library },
  "/dashboard/admin/users": { label: "Manage Users", icon: UsersRound },
  "/dashboard/admin/trash": { label: "Admin Trash", icon: Trash2 },
};

export function WorkspaceSidebar({ navItems }: { navItems: ModuleNavItem[] }) {
  const { user, loading, error, restore, logout } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const profileMenu = useRef<HTMLDetailsElement>(null);
  const contentId = useId();
  const pathname = usePathname();
  const visibleItems = navItems.filter(item => item.permission ? hasPermission(user, item.permission) : !item.admin);
  const order = Object.keys(navigation);
  visibleItems.sort((a, b) => order.indexOf(a.href) - order.indexOf(b.href));
  const role = user?.role === "super_admin" ? "Super administrator" : user?.role === "admin" ? "Administrator" : "Author";

  function links(admin: boolean) {
    return visibleItems.filter(item => !!item.admin === admin).map(item => {
      const { label, icon: Icon } = navigation[item.href] || { label: item.label, icon: BookOpen };
      const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
      return (
        <Link key={item.href} href={item.href} className={item.href === "/dashboard/chat" ? "workspace-chat-link" : undefined}
          aria-current={active ? "page" : undefined} onClick={() => setExpanded(false)}>
          <Icon size={19} aria-hidden="true" /><span>{label}</span>
          {item.href === "/dashboard/chat" && <UnreadChatBadge />}
        </Link>
      );
    });
  }

  return (
    <aside className="dashboard-sidebar workspace-sidebar" aria-label="Sidebar" data-expanded={expanded}>
      <div className="sidebar-heading">
        <span className="eyebrow">BlogHub workspace</span>
        <button className="mobile-workspace-toggle" type="button" aria-expanded={expanded} aria-controls={contentId}
          onClick={() => setExpanded(value => !value)}>Menu <ChevronDown size={18} aria-hidden="true" /></button>
        {!loading && user && <div className="sidebar-notifications" onClick={() => setExpanded(false)}><NotificationBell key={user.id} /></div>}
      </div>
      <div id={contentId} className="sidebar-body">
        {loading ? <p className="field-help" role="status">Checking your session…</p> : error ? (
          <p className="notice" role="alert">{error}{" "}<button className="text-link" onClick={() => void restore()}>Retry session check</button></p>
        ) : user ? (
          <>
            <nav aria-label="Workspace navigation">
              <p className="sidebar-group-label">Workspace</p>
              <Link href="/" aria-current={pathname === "/" ? "page" : undefined} onClick={() => setExpanded(false)}>
                <LayoutGrid size={19} aria-hidden="true" /><span>Overview</span>
              </Link>
              {links(false)}
              {visibleItems.some(item => item.admin) && <>
                <p className="sidebar-group-label administration-label">Administration</p>
                {links(true)}
              </>}
            </nav>
            <details ref={profileMenu} className="sidebar-user" onKeyDown={event => {
              if (event.key === "Escape" && profileMenu.current) {
                profileMenu.current.open = false;
                profileMenu.current.querySelector("summary")?.focus();
              }
            }}>
              <summary aria-label="Account menu">
                <span className="user-avatar" aria-hidden="true">{Array.from(user.displayName.trim())[0]?.toLocaleUpperCase() || "U"}</span>
                <span className="sidebar-user-info"><strong>{user.displayName}</strong><span>{role}</span></span>
                <ChevronDown size={17} aria-hidden="true" />
              </summary>
              <div className="sidebar-user-menu">
                <p className="field-help">{user.email}</p>
                <Link href="/dashboard" onClick={() => { profileMenu.current!.open = false; setExpanded(false); }}><UserRound size={18} aria-hidden="true" />Profile</Link>
                <Link href="/settings" aria-label="Account settings" onClick={() => { profileMenu.current!.open = false; setExpanded(false); }}><Settings size={18} aria-hidden="true" />Settings</Link>
                <button type="button" data-leave-editor disabled={signingOut} onClick={async () => {
                  setSigningOut(true);
                  setLogoutError("");
                  try {
                    await logout();
                    setExpanded(false);
                    toast.success("Signed out successfully.");
                  } catch (failure) {
                    setLogoutError(errorMessage(failure));
                    toast.error(errorMessage(failure));
                  } finally { setSigningOut(false); }
                }}><LogOut size={18} aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}</button>
                {logoutError && <p className="notice" role="alert">{logoutError}</p>}
              </div>
            </details>
          </>
        ) : (
          <nav aria-label="Account navigation">
            <Link href="/login" onClick={() => setExpanded(false)}><UserRound size={19} aria-hidden="true" />Log in</Link>
            <Link href="/register" onClick={() => setExpanded(false)}><SquarePen size={19} aria-hidden="true" />Sign up</Link>
          </nav>
        )}
      </div>
    </aside>
  );
}

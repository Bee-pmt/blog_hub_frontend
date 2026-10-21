"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGetNotificationsQuery } from "../store/services/notificationApi";

export default function NotificationBell() {
  const pathname = usePathname();
  const active = pathname === "/dashboard/notifications";
  const { data } = useGetNotificationsQuery(1, { pollingInterval: 30_000 });

  return (
    <Link
      className={`sidebar-settings-button notification-bell${active ? " is-active" : ""}`}
      href="/dashboard/notifications"
      aria-current={active ? "page" : undefined}
      aria-label={
        data?.unreadCount
          ? `Notifications, ${data.unreadCount} unread`
          : "Notifications"
      }
      title="Notifications"
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
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </svg>
      {!!data?.unreadCount && (
        <span className="notification-count" aria-hidden="true">
          {data.unreadCount > 99 ? "99+" : data.unreadCount}
        </span>
      )}
    </Link>
  );
}

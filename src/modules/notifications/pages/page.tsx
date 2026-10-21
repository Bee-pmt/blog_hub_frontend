"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { queryError } from "@/lib/api/baseApi";
import { relativeTime } from "@/lib/utils";
import {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} from "../store/services/notificationApi";

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(Date.now);
  const [readError, setReadError] = useState("");
  const {
    currentData: data,
    error,
    isFetching,
    refetch,
  } = useGetNotificationsQuery(page, {
    pollingInterval: 30_000,
    refetchOnMountOrArgChange: true,
  });
  const [markRead, readState] = useMarkNotificationReadMutation();
  const [markAllRead, allReadState] = useMarkAllNotificationsReadMutation();
  const busy = readState.isLoading || allReadState.isLoading;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (data && !isFetching && page > Math.max(1, data.totalPages))
    setPage(Math.max(1, data.totalPages));

  async function handleRead(id?: string) {
    setReadError("");
    try {
      if (id) await markRead(id).unwrap();
      else await markAllRead().unwrap();
    } catch (error) {
      setReadError(queryError(error));
    }
  }

  return (
    <section className="notification-panel" aria-label="Notifications">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your updates</p>
          <h1>Notifications</h1>
        </div>
        <button
          className="text-link"
          disabled={busy || !data?.unreadCount}
          onClick={() => void handleRead()}
        >
          Mark all as read
        </button>
      </div>
      {data && <p className="result-count">{data.unreadCount} unread</p>}
      {readError && (
        <p className="notice" role="alert">
          {readError}
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {queryError(error)}{" "}
          <button className="text-link" onClick={() => void refetch()}>
            Try again
          </button>
        </p>
      )}
      {isFetching && !data && <p role="status">Loading notifications…</p>}
      {data && (
        <>
          {data.items.length ? (
            <ul className="notification-list">
              {data.items.map((item) => (
                <li
                  key={item.id}
                  className={item.readAt ? "" : "notification-unread"}
                >
                  <span className="notification-avatar" aria-hidden="true">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Zm0 0v6h6M8 13h8M8 17h5" />
                    </svg>
                    <span className="notification-type-icon">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        {item.type === "post_deleted" ? (
                          <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
                        ) : (
                          <path d="m5 5 14 14M19 5 5 19" />
                        )}
                      </svg>
                    </span>
                  </span>
                  <div className="notification-body">
                    <p>{item.message}</p>
                    <time
                      dateTime={item.createdAt}
                      title={new Date(item.createdAt).toLocaleString()}
                    >
                      {relativeTime(item.createdAt, now)}
                    </time>
                    <div className="notification-actions">
                      {item.type === "post_unpublished" && (
                        <Link
                          className="text-link"
                          href={`/dashboard/posts/${encodeURIComponent(item.blogId)}/edit`}
                        >
                          Edit story
                        </Link>
                      )}
                      {!item.readAt && (
                        <button
                          className="text-link"
                          disabled={busy}
                          onClick={() => void handleRead(item.id)}
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                  {!item.readAt && (
                    <span className="notification-unread-dot">
                      <span className="sr-only">Unread</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No notifications yet.</p>
          )}
          {data.totalPages > 1 && (
            <nav className="pagination" aria-label="Notification pages">
              <button
                disabled={page <= 1 || isFetching}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {data.totalPages}
              </span>
              <button
                disabled={page >= data.totalPages || isFetching}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

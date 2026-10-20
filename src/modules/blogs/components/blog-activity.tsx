"use client";

import { useEffect, useRef, useState } from "react";
import { dateLabel } from "@/lib/utils";
import { queryError } from "@/lib/api/baseApi";
import {
  useGetMyBlogAuditLogsQuery,
  useGetMyBlogAuditLogQuery,
} from "../store/services/blogApi";
import type { BlogAuditLog } from "../types";
import Markdown from "./markdown";
import BlogImage from "./blog-image";

const fieldLabels: Record<string, string> = {
  title: "Title",
  content: "Content",
  category: "Category",
  tags: "Tags",
  coverImageUrl: "Cover image",
  status: "Status",
  publicationBlocked: "Publishing blocked",
  publishedAt: "Publication date",
};

function displayValue(value: BlogAuditLog["changes"][string]["old"]) {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value))
    return value.map((tag) => tag.name).join(", ") || "None";
  if (typeof value === "object") return value.name;
  return value || "Empty";
}

function ActivityDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { data, isLoading, error, refetch } = useGetMyBlogAuditLogQuery(id);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirm-dialog activity-dialog"
      aria-labelledby="activity-title"
      onClose={(event) => {
        // Ignore a queued cleanup event if Strict Mode has already reopened it.
        if (!event.currentTarget.open) onClose();
      }}
    >
      <div className="section-heading">
        <h2 id="activity-title">Activity details</h2>
        <button
          className="button button-secondary"
          onClick={() => dialog.current?.close()}
          autoFocus
        >
          Close
        </button>
      </div>
      {isLoading ? (
        <p role="status">Loading activity details…</p>
      ) : error ? (
        <div className="notice" role="alert">
          {queryError(error)}{" "}
          <button className="text-link" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      ) : (
        data && (
          <>
            <h3>{data.blogTitle}</h3>
            <p>
              <span className="badge">{data.action}</span> ·{" "}
              <time dateTime={data.createdAt}>
                {new Date(data.createdAt).toLocaleString()}
              </time>
            </p>
            {Object.entries(data.changes).map(([field, change]) => (
              <section className="activity-change" key={field}>
                <h3>{fieldLabels[field] || field}</h3>
                <div className="activity-values">
                  <div>
                    <h4>Before</h4>
                    <pre>{displayValue(change.old)}</pre>
                  </div>
                  <div>
                    <h4>After</h4>
                    <pre>{displayValue(change.new)}</pre>
                  </div>
                </div>
              </section>
            ))}
            {data.snapshot && (
              <section className="activity-change">
                <h3>Deleted story</h3>
                <p>This copy shows the story just before it was deleted.</p>
                <dl className="activity-metadata">
                  <dt>Title</dt>
                  <dd>{data.snapshot.title}</dd>
                  <dt>Story URL</dt>
                  <dd>/blogs/{data.snapshot.slug}</dd>
                  <dt>Status</dt>
                  <dd>{data.snapshot.status}</dd>
                  <dt>Category</dt>
                  <dd>{data.snapshot.categoryName}</dd>
                  <dt>Tags</dt>
                  <dd>{displayValue(data.snapshot.tags)}</dd>
                  <dt>Publishing blocked</dt>
                  <dd>
                    {displayValue(data.snapshot.publicationBlocked ?? false)}
                  </dd>
                  <dt>Created</dt>
                  <dd>{dateLabel(data.snapshot.createdAt)}</dd>
                  <dt>Last updated</dt>
                  <dd>{dateLabel(data.snapshot.updatedAt)}</dd>
                  <dt>Published</dt>
                  <dd>
                    {data.snapshot.publishedAt
                      ? dateLabel(data.snapshot.publishedAt)
                      : "Never published"}
                  </dd>
                </dl>
                {data.snapshot.coverImageUrl && (
                  <BlogImage
                    src={data.snapshot.coverImageUrl}
                    alt="Historical story cover"
                    className="editor-cover"
                  />
                )}
                <h3>Content</h3>
                <Markdown content={data.snapshot.content} />
              </section>
            )}
          </>
        )
      )}
    </dialog>
  );
}

export default function BlogActivity() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const {
    currentData: data,
    isFetching,
    error,
    refetch,
  } = useGetMyBlogAuditLogsQuery(page);
  if (data && !isFetching && page > Math.max(1, data.totalPages))
    setPage(Math.max(1, data.totalPages));
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your history</p>
          <h1>My activity</h1>
        </div>
        <button
          className="button button-secondary"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          Refresh
        </button>
      </div>
      <p className="muted">
        Your story edits, publishing changes, and deletions. Only actions you
        performed appear here.
      </p>
      {error ? (
        <div className="notice" role="alert">
          {queryError(error)}{" "}
          <button className="text-link" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      ) : isFetching ? (
        <p className="loading-state" role="status">
          Loading your activity…
        </p>
      ) : (
        data && (
          <>
            <p className="result-count" role="status">
              {data.total} {data.total === 1 ? "action" : "actions"} · 10 per
              page
            </p>
            {data.items.length ? (
              <div className="manage-list">
                {data.items.map((log) => (
                  <article className="manage-row" key={log.id}>
                    <div>
                      <span className="badge">{log.action}</span>
                      <h2>{log.blogTitle}</h2>
                      <p className="muted">
                        <time
                          dateTime={log.createdAt}
                          title={new Date(log.createdAt).toLocaleString()}
                        >
                          {dateLabel(log.createdAt)}
                        </time>
                      </p>
                    </div>
                    <button
                      className="text-link"
                      aria-label={`View details for ${log.blogTitle}`}
                      onClick={() => setSelectedId(log.id)}
                    >
                      View details
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h2>No activity yet.</h2>
                <p>
                  Your next story edit, publishing change, or deletion will
                  appear here.
                </p>
              </div>
            )}
            <nav className="pagination" aria-label="Activity pages">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>
                Page {page} of {Math.max(1, data.totalPages)}
              </span>
              <button
                disabled={page >= data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </nav>
          </>
        )
      )}
      {selectedId && (
        <ActivityDetails
          key={selectedId}
          id={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}

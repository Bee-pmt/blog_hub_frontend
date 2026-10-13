"use client";
import type { BlogSummary as Blog } from "@/types/models";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { dateLabel, errorMessage } from "@/lib/api";
import { blogListKey } from "./blog-store";
import { useAuth, useBlogStore } from "@/features/auth/auth-provider";
import ConfirmDialog from "@/components/confirm-dialog";
type PostManagerProps = { admin?: boolean };

export default function PostManager({ admin = false }: PostManagerProps) {
  const api = useAuth((state) => state.api);
  const contentApi = useAuth((state) => state.contentApi);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [mutationError, setError] = useState("");
  const entry = useBlogStore(
    (state) => state.lists[blogListKey(admin, status, page)],
  );
  const loadBlogs = useBlogStore((state) => state.loadBlogs);
  const changeStatus = useBlogStore((state) => state.changeStatus);
  const removeBlog = useBlogStore((state) => state.remove);
  const version = useBlogStore((state) => state.version);
  const data = entry?.data;
  const loading = !entry || entry.loading;
  const error = mutationError || entry?.error || "";
  const [busy, setBusy] = useState("");
  const [deleting, setDeleting] = useState<Blog | null>(null);
  useEffect(() => {
    let active = true;
    loadBlogs(admin, status, page, api)
      .then((result) => {
        if (active && page > 1 && page > result.totalPages)
          setPage(Math.max(1, result.totalPages));
      })
      .catch(() => {
        /* The store exposes the loading error. */
      });
    return () => {
      active = false;
    };
  }, [api, admin, status, page, version, loadBlogs]);
  async function mutate(post: Blog, remove: boolean) {
    if (busy) return;
    setBusy(post.id);
    setError("");
    try {
      if (remove) await removeBlog(post.id, contentApi);
      else {
        await changeStatus(
          post.id,
          post.status === "draft" ? "published" : "draft",
          admin,
          contentApi,
        );
      }
      toast.success(
        remove
          ? "Story deleted."
          : post.status === "draft"
            ? "Your story is published."
            : "Story unpublished.",
      );
    } catch (failure) {
      setError(errorMessage(failure));
      toast.error(errorMessage(failure));
    } finally {
      setBusy("");
      setDeleting(null);
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{admin ? "Moderation" : "Your journal"}</p>
          <h1>{admin ? "All stories" : "My stories"}</h1>
        </div>
        <Link className="button button-primary" href="/dashboard/posts/new">
          Write a story ↗
        </Link>
      </div>
      <div className="tabs" aria-label="Filter post status">
        {[
          ["", "All"],
          ["draft", "Drafts"],
          ["published", "Published"],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={value === status}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <div className="notice" role="alert">
          {error}{" "}
          <button
            className="text-link"
            onClick={() => {
              setError("");
              void loadBlogs(admin, status, page, api, true).catch(() => {});
            }}
          >
            Try again
          </button>
        </div>
      )}
      {loading ? (
        <p className="loading-state" role="status">
          Loading stories…
        </p>
      ) : (
        data && (
          <>
            {!data.items.length ? (
              <div className="empty-state">
                <h2>A fresh page.</h2>
                <p>
                  {admin
                    ? "No stories match this status."
                    : "Your stories will appear here. Start with an idea."}
                </p>
              </div>
            ) : (
              <div className="manage-list">
                {data.items.map((post) => (
                  <article className="manage-row" key={post.id}>
                    <div>
                      <span className="badge">{post.status}</span>
                      <h2>
                        {admin ? (
                          post.title
                        ) : (
                          <Link href={`/dashboard/posts/${post.id}/edit`}>
                            {post.title}
                          </Link>
                        )}
                      </h2>
                      <p className="muted">
                        {post.categoryName} · Updated{" "}
                        {dateLabel(post.updatedAt)}
                        {admin && ` · ${post.author.displayName}`}
                      </p>
                      {post.publicationBlocked && (
                        <p className="field-help">
                          Unpublished by an admin. Only an admin can publish
                          this story again.
                        </p>
                      )}
                    </div>
                    <div className="row-actions">
                      {!admin && (
                        <Link
                          className="text-link"
                          href={`/dashboard/posts/${post.id}/edit`}
                        >
                          Edit
                        </Link>
                      )}
                      {post.status === "published" && (
                        <Link
                          className="text-link"
                          href={`/blogs/${encodeURIComponent(post.slug)}`}
                        >
                          Read
                        </Link>
                      )}
                      <button
                        className="text-link"
                        disabled={
                          !!busy || (!admin && !!post.publicationBlocked)
                        }
                        onClick={() => void mutate(post, false)}
                      >
                        {busy === post.id
                          ? "Working…"
                          : post.status === "draft"
                            ? "Publish"
                            : "Unpublish"}
                      </button>
                      <button
                        className="text-link"
                        disabled={!!busy}
                        onClick={() => setDeleting(post)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <nav className="pagination" aria-label="Workspace pages">
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.max(1, data.totalPages)}
              </span>
              <button
                disabled={page >= data.totalPages || loading}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </nav>
          </>
        )
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this story?"
          message={`“${deleting.title}” will be permanently removed. This cannot be undone.`}
          busy={!!busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void mutate(deleting, true)}
        />
      )}
    </>
  );
}

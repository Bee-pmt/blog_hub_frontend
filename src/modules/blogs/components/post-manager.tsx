"use client";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { hasPermission } from "@/modules/auth/permissions";
import BlogPreview from "./blog-preview";
import type { BlogSummary as Blog } from "@/modules/blogs/types";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { dateLabel } from "@/lib/utils";
import { errorMessage } from "@/lib/api-client";
import {
  useGetManagedBlogsQuery,
  useChangeBlogStatusMutation,
  useDeleteBlogMutation,
} from "../store/services/blogApi";
import { queryError } from "@/lib/api/baseApi";

import ConfirmDialog from "@/modules/base/components/confirm-dialog";
type PostManagerProps = { admin?: boolean };

export default function PostManager({ admin = false }: PostManagerProps) {
  const { user } = useAuth();
  const allowed = !admin || hasPermission(user, "blogs.moderate");
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [mutationError, setError] = useState("");
  const {
    currentData: data,
    isLoading,
    isFetching,
    error: loadError,
    refetch,
  } = useGetManagedBlogsQuery({ admin, status, page }, { skip: !allowed });
  const [changeStatus] = useChangeBlogStatusMutation();
  const [removeBlog] = useDeleteBlogMutation();
  const loading = isLoading || isFetching;
  const error = mutationError || queryError(loadError);
  const [busy, setBusy] = useState("");
  const [deleting, setDeleting] = useState<Blog | null>(null);
  if (data && !loading && page > 1 && page > data.totalPages)
    setPage(Math.max(1, data.totalPages));
  async function mutate(post: Blog, remove: boolean) {
    if (busy) return;
    setBusy(post.id);
    setError("");
    try {
      if (remove) await removeBlog({ id: post.id, version: post.version }).unwrap();
      else {
        await changeStatus({
          id: post.id,
          status: post.status === "draft" ? "published" : "draft",
          admin,
        }).unwrap();
      }
      toast.success(
        remove
          ? "Story moved to Trash."
          : post.status === "draft"
            ? "Your story is published."
            : "Story unpublished.",
      );
    } catch (failure) {
      const message = errorMessage(failure);
      setError(message);
      toast.error(message);
    } finally {
      setBusy("");
      setDeleting(null);
    }
  }
  if (!allowed) return <p role="alert">You do not have permission to moderate stories.</p>;
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
              void refetch();
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
                      {admin && <button className="text-link" onClick={() => setSelected(post.id)}>Inspect</button>}
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
                      {(post.author.id === user?.id || hasPermission(user, "blogs.delete")) && <button
                        className="text-link"
                        disabled={!!busy}
                        onClick={() => setDeleting(post)}
                      >
                        Move to Trash
                      </button>}
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
      {selected && <BlogPreview id={selected} admin={admin} onClose={() => { setSelected(null); void refetch(); }} />}
      {deleting && (
        <ConfirmDialog
          title="Move this story to Trash?" confirmLabel="Move to Trash" busyLabel="Moving…"
          message={`“${deleting.title}” will move to Trash. You can manage it from My Trash.`}
          busy={!!busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void mutate(deleting, true)}
        />
      )}
    </>
  );
}

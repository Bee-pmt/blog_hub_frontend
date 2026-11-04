"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { hasPermission } from "@/modules/auth/permissions";
import { queryError } from "@/lib/api/baseApi";
import { dateLabel } from "@/lib/utils";
import ConfirmDialog from "@/modules/base/components/confirm-dialog";
import { useGetBlogTrashQuery, useRestoreBlogMutation, usePurgeBlogMutation } from "../store/services/blogApi";
import type { Blog, TrashedBlogSummary } from "../types";
import BlogPreview from "./blog-preview";

export default function BlogTrash({ admin = false }: { admin?: boolean }) {
  const { user } = useAuth();
  const allowed = !admin || hasPermission(user, "blogs.moderate");
  const [page, setPage] = useState(1);
  const { currentData: data, isFetching, error, refetch } = useGetBlogTrashQuery({ admin, page }, { skip: !allowed });
  const [restore, restoreState] = useRestoreBlogMutation();
  const [purge, purgeState] = usePurgeBlogMutation();
  const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TrashedBlogSummary | null>(null);
  const [restored, setRestored] = useState<Blog | null>(null);
  const [failure, setFailure] = useState("");
  const pending = useRef(false);
  const busy = restoreState.isLoading || purgeState.isLoading;

  if (data && !isFetching && page > Math.max(1, data.totalPages)) setPage(Math.max(1, data.totalPages));

  async function act(post: TrashedBlogSummary, permanently: boolean) {
    if (pending.current) return;
    pending.current = true;
    setFailure("");
    setRestored(null);
    try {
      if (permanently) await purge({ admin, id: post.id }).unwrap();
      else setRestored(await restore({ admin, id: post.id }).unwrap());
      setSelected(null);
      toast.success(permanently ? "Story permanently deleted." : "Story restored as a draft.");
    } catch (error) {
      setFailure(queryError(error));
    } finally {
      pending.current = false;
      setDeleting(null);
    }
  }

  if (!allowed) return <p role="alert">You do not have permission to view Admin Trash.</p>;

  return (
    <>
      <div className="section-heading"><h1>{admin ? "Admin Trash" : "My Trash"}</h1></div>
      <p className="muted">
        Trashed stories are hidden from readers. Restoring keeps their comments and reactions
        and returns them to drafts. Trash never expires automatically.
      </p>
      {restored && (
        <p className="notice" role="status">
          “{restored.title}” was restored as a draft.{" "}
          {restored.author.id === user?.id ? (
            <Link className="text-link" href={`/dashboard/posts/${encodeURIComponent(restored.id)}/edit`}>Open draft editor</Link>
          ) : "The author can edit the restored draft."}
          {restored.publicationBlocked && " Publishing remains blocked until a moderator publishes it."}
        </p>
      )}
      {(failure || error) && (
        <p className="notice" role="alert">
          {failure || queryError(error)}{" "}
          <button className="text-link" disabled={busy} onClick={() => { setFailure(""); void refetch(); }}>Refresh Trash</button>
        </p>
      )}
      {isFetching ? <p role="status">Loading Trash…</p> : !error && data && (
        <>
          <p className="result-count">{data.total} {data.total === 1 ? "story" : "stories"} in Trash</p>
          {!data.items.length ? <div className="empty-state"><h2>Trash is empty.</h2></div> : (
            <div className="manage-list">
              {data.items.map(post => (
                <article className="manage-row" key={post.id}>
                  <div>
                    <h2>{post.title}</h2>
                    <p className="muted">
                      {post.author.displayName} · Moved to Trash{" "}
                      <time dateTime={post.deletedAt}>{dateLabel(post.deletedAt)}</time>
                    </p>
                    <p>{post.excerpt}</p>
                    {!admin && !post.canRestore && (
                      <p className="field-help">
                        You cannot restore this story. If an administrator moved it to Trash,
                        an authorized administrator must restore it through Admin Trash.
                      </p>
                    )}
                  </div>
                  <div className="row-actions">
                    <button className="text-link" disabled={busy} onClick={() => setSelected(post.id)}>Preview</button>
                    {post.canRestore && (!admin || hasPermission(user, "blogs.restore")) && (
                      <button className="text-link" disabled={busy} onClick={() => void act(post, false)}>Restore</button>
                    )}
                    {post.canPermanentlyDelete && (!admin || hasPermission(user, "blogs.purge")) && (
                      <button className="text-link" disabled={busy} onClick={() => setDeleting(post)}>Delete permanently</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          <nav className="pagination" aria-label="Trash pages">
            <button disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} of {Math.max(1, data.totalPages)}</span>
            <button disabled={busy || page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</button>
          </nav>
        </>
      )}
      {selected && <BlogPreview key={selected} id={selected} admin={admin} trash onClose={() => { setSelected(null); void refetch(); }} />}
      {deleting && (
        <ConfirmDialog
          title="Delete this story permanently?"
          confirmLabel="Delete permanently"
          message={`“${deleting.title}”, its comments, replies, reactions, and tag links will be permanently removed. This cannot be undone.`}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void act(deleting, true)}
        />
      )}
    </>
  );
}

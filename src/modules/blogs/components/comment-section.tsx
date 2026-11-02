"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import ConfirmDialog from "@/modules/base/components/confirm-dialog";
import { queryError } from "@/lib/api/baseApi";
import { dateLabel } from "@/lib/utils";
import type { BlogComment } from "../types";
import { useGetCommentsQuery, useSaveCommentMutation, useDeleteCommentMutation } from "../store/services/commentApi";

function CommentForm({ blogId, parentId, comment, onDone }: {
  blogId: string;
  parentId?: string;
  comment?: BlogComment;
  onDone?: () => void;
}) {
  const [content, setContent] = useState(comment?.content ?? "");
  const [error, setError] = useState("");
  const [save, { isLoading }] = useSaveCommentMutation();
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const text = content.trim();
    if (!text || text.length > 2000) {
      setError("Use 1–2000 characters, excluding surrounding spaces.");
      return;
    }
    submitting.current = true;
    setError("");
    try {
      await save({ blogId, parentId, id: comment?.id, content: text }).unwrap();
      if (!comment) setContent("");
      onDone?.();
    } catch (failure) {
      setError(queryError(failure));
    } finally {
      submitting.current = false;
    }
  }

  return (
    <form className="stack comment-form" onSubmit={submit}>
      <label>
        {comment ? "Edit your comment" : parentId ? "Your reply" : "Your comment"}
        <textarea
          className="form-control"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={2000}
          rows={3}
          required
          disabled={isLoading}
        />
      </label>
      <p className="field-help">{content.length}/2000 characters</p>
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="actions">
        <button className="button button-primary" disabled={isLoading}>
          {isLoading ? "Saving…" : comment ? "Save changes" : parentId ? "Post reply" : "Post comment"}
        </button>
        {comment && <button className="text-link" type="button" disabled={isLoading} onClick={onDone}>Cancel</button>}
      </div>
    </form>
  );
}

function CommentRow({ comment, blogId }: { comment: BlogComment; blogId: string }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [remove, { isLoading }] = useDeleteCommentMutation();
  const deletingNow = useRef(false);
  const own = user?.id === comment.author.id;

  async function deleteComment() {
    if (deletingNow.current) return;
    deletingNow.current = true;
    setError("");
    try {
      await remove({ blogId, id: comment.id }).unwrap();
      setDeleting(false);
    } catch (failure) {
      setError(queryError(failure));
      setDeleting(false);
    } finally {
      deletingNow.current = false;
    }
  }

  return (
    <li className="comment-row">
      <div className="post-meta">
        <strong>{comment.author.displayName}</strong>
        <time dateTime={comment.createdAt}>{dateLabel(comment.createdAt)}</time>
        {comment.updatedAt !== comment.createdAt && <span>Edited</span>}
      </div>
      {editing ? (
        <CommentForm blogId={blogId} comment={comment} onDone={() => setEditing(false)} />
      ) : <p className="comment-content">{comment.content}</p>}
      <div className="actions">
        {!comment.parentId && (
          <button className="text-link" aria-expanded={open} aria-controls={`replies-${comment.id}`} onClick={() => setOpen(!open)}>
            {open ? "Hide replies" : "View replies / Reply"}
          </button>
        )}
        {own && !editing && <button className="text-link" onClick={() => setEditing(true)}>Edit</button>}
        {(own || user?.role === "admin") && <button className="text-link" disabled={isLoading} onClick={() => setDeleting(true)}>Delete</button>}
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
      {!comment.parentId && (
        <div className="comment-replies" id={`replies-${comment.id}`} hidden={!open}>
          {open && <CommentList blogId={blogId} parentId={comment.id} />}
        </div>
      )}
      {deleting && (
        <ConfirmDialog
          title={comment.parentId ? "Delete this reply?" : "Delete this comment?"}
          message={comment.parentId ? "This permanently deletes your selected reply." : "This permanently deletes this comment and all its replies. This cannot be undone."}
          busy={isLoading}
          onCancel={() => setDeleting(false)}
          onConfirm={() => void deleteComment()}
        />
      )}
    </li>
  );
}

function CommentList({ blogId, parentId }: { blogId: string; parentId?: string }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [page, setPage] = useState(1);
  const { currentData: data, error, isFetching, refetch } = useGetCommentsQuery({ blogId, parentId, page });
  const totalPages = Math.max(1, data?.totalPages ?? 1);
  if (data && !isFetching && page > totalPages) setPage(totalPages);

  return (
    <>
      {!parentId && <h2>Comments{data ? ` (${data.total})` : ""}</h2>}
      {parentId && <h3>Replies{data ? ` (${data.total})` : ""}</h3>}
      {error ? (
        <p className="notice" role="alert">
          {queryError(error)}{" "}
          <button className="text-link" onClick={() => void refetch()}>Try again</button>
        </p>
      ) : (
        <>
          {loading ? <p role="status">Checking your session…</p> : user ? (
            <CommentForm blogId={blogId} parentId={parentId} />
          ) : (
            <p><Link className="text-link" href={`/login?returnTo=${encodeURIComponent(pathname)}`}>Sign in to {parentId ? "reply" : "comment"}</Link></p>
          )}
          {isFetching && <p role="status">Loading {parentId ? "replies" : "comments"}…</p>}
          {data && (data.items.length ? (
            <ul className="comment-list">
              {data.items.map((comment) => <CommentRow key={comment.id} comment={comment} blogId={blogId} />)}
            </ul>
          ) : <p className="muted">{parentId ? "No replies yet." : "No comments yet. Start the conversation."}</p>)}
          {data && totalPages > 1 && (
            <nav className="pagination" aria-label={parentId ? "Reply pages" : "Comment pages"}>
              <button disabled={isFetching || page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page} of {totalPages}</span>
              <button disabled={isFetching || page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
            </nav>
          )}
        </>
      )}
    </>
  );
}

export default function CommentSection({ blogId }: { blogId: string }) {
  const { user } = useAuth();
  return (
    <section className="comment-section" aria-label="Comments">
      <CommentList key={`${blogId}:${user?.id}:${user?.role}`} blogId={blogId} />
    </section>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { queryError } from "@/lib/api/baseApi";
import { useGetEditableBlogQuery, useGetTrashedBlogQuery } from "../store/services/blogApi";
import Markdown from "./markdown";
import BlogImage from "./blog-image";

export default function BlogPreview({ id, admin, trash = false, onClose }: {
  id: string;
  admin: boolean;
  trash?: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const normal = useGetEditableBlogQuery({ id, admin }, { skip: trash });
  const deleted = useGetTrashedBlogQuery({ id, admin }, { skip: !trash });
  const { currentData: data, error, isFetching, refetch } = trash ? deleted : normal;

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (error && "status" in error && [404, 409].includes(error.status)) {
      toast.error("This story is unavailable or its state changed. Refreshing the list.");
      onClose();
    }
  }, [error, onClose]);

  return (
    <dialog
      ref={dialog}
      className="confirm-dialog activity-dialog"
      aria-label="Story preview"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <div className="section-heading">
        <h2>Story preview</h2>
        <button className="button button-secondary" autoFocus onClick={onClose}>Close</button>
      </div>
      {isFetching ? <p role="status">Loading story…</p> : error ? (
        <p className="notice" role="alert">
          {queryError(error)}{" "}
          <button className="text-link" onClick={() => void refetch()}>Refresh preview</button>
        </p>
      ) : data && (
        <>
          <h3>{data.title}</h3>
          <p className="muted">{data.author.displayName} · {data.status}</p>
          {data.publicationBlocked && (
            <p className="notice">Publishing is blocked. A moderator must publish this story.</p>
          )}
          {data.coverImageUrl && <BlogImage src={data.coverImageUrl} className="editor-cover" />}
          <Markdown content={data.content} />
        </>
      )}
    </dialog>
  );
}

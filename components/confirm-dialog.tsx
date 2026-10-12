"use client";
import type { ConfirmDialogProps } from "@/type/type";
import { useEffect, useRef } from "react";
export default function ConfirmDialog({
  title,
  message,
  busy,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      <p id="confirm-description">{message}</p>
      <div className="actions">
        <button
          className="button button-secondary"
          disabled={busy}
          autoFocus
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className="button button-primary"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Deleting…" : "Delete permanently"}
        </button>
      </div>
    </dialog>
  );
}

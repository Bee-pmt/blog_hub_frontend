"use client";
import type {
  Category,
  Tag,
  TaxonomyKind,
  TaxonomySelection,
} from "@/modules/taxonomy/types";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api-client";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import {
  useGetTaxonomyQuery,
  useSaveTaxonomyMutation,
  useDeleteTaxonomyMutation,
} from "../store/services/taxonomyApi";
import { queryError } from "@/lib/api/baseApi";
import { useForm } from "react-hook-form";
import ConfirmDialog from "@/modules/base/components/confirm-dialog";
export default function TaxonomyManager() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const {
    data,
    isLoading: loading,
    error: queryFailure,
    refetch,
  } = useGetTaxonomyQuery();
  const categories = data?.categories ?? [];
  const tags = data?.tags ?? [];
  const loadError = queryError(queryFailure);
  const [saveTaxonomy] = useSaveTaxonomyMutation();
  const [deleteTaxonomy] = useDeleteTaxonomyMutation();
  const categoryForm = useForm<{ name: string }>();
  const tagForm = useForm<{ name: string; categoryId: string }>();
  const editForm = useForm<{ name: string }>();
  const [mutationError, setError] = useState("");
  const error = mutationError || loadError;
  const [busy, setBusy] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [editing, setEditing] = useState<TaxonomySelection | null>(null);
  const [editError, setEditError] = useState("");
  const editDialog = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState<TaxonomySelection | null>(null);
  const visibleTags = tags.filter(
    (item) => isAdmin || item.createdById === user?.id,
  );
  const visibleCategories = categories.filter(
    (item) =>
      isAdmin ||
      item.createdById === user?.id ||
      visibleTags.some((tag) => tag.categoryId === item.id),
  );
  useEffect(() => {
    if (!editing) return;
    editForm.reset({ name: editing.item.name });
    const dialog = editDialog.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>("input")?.select();
    return () => dialog?.close();
  }, [editing, editForm]);
  async function save(
    values: { name: string; categoryId?: string },
    kind: TaxonomyKind,
    id?: string,
  ) {
    if (busy) return;
    const name = values.name.trim();
    if (!name || !/[\p{L}\p{N}]/u.test(name)) {
      const message = "Use a name containing at least one letter or number.";
      if (id) setEditError(message);
      else setError(message);
      toast.error(message);
      return;
    }
    setBusy(true);
    setError("");
    setEditError("");
    try {
      await saveTaxonomy({
        kind,
        input: {
          name,
          ...(!id && kind === "tags" ? { categoryId: values.categoryId } : {}),
        },
        id,
      }).unwrap();
      if (id) setEditing(null);
      else if (kind === "categories") categoryForm.reset();
      else tagForm.reset();
      toast.success(
        id
          ? "Name updated. Discovery links now use the new slug."
          : "Created successfully.",
      );
    } catch (failure) {
      const message = errorMessage(failure);
      if (id) setEditError(message);
      else setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }
  function entry(item: Category, kind: TaxonomyKind) {
    const editable = isAdmin || item.createdById === user?.id;
    const categoryTags =
      kind === "categories"
        ? visibleTags.filter((tag) => tag.categoryId === item.id)
        : [];
    const expanded = expandedCategories.includes(item.id);
    return (
      <li key={item.id} className="taxonomy-row">
        <div>
          {kind === "categories" ? (
            <button
              className="taxonomy-toggle"
              type="button"
              aria-label={`Tags for ${item.name}`}
              aria-expanded={expanded}
              aria-controls={`category-tags-${item.id}`}
              onClick={() =>
                setExpandedCategories((current) =>
                  current.includes(item.id)
                    ? current.filter((id) => id !== item.id)
                    : [...current, item.id],
                )
              }
            >
              <span className="taxonomy-chevron" aria-hidden="true">
                {expanded ? "▾" : "▸"}
              </span>
              <strong>{item.name}</strong>
              <span className="muted">
                ({categoryTags.length}{" "}
                {categoryTags.length === 1 ? "tag" : "tags"})
              </span>
            </button>
          ) : (
            <strong>{item.name}</strong>
          )}
          <p className="field-help">
            /{item.slug}
            {kind === "categories" && !editable && " · Contains your tags"}
            {kind === "tags" &&
              ` · ${categories.find((category) => category.id === (item as Tag).categoryId)?.name || "Category unavailable"}`}
          </p>
        </div>
        {editable && (
          <button
            className="button button-secondary taxonomy-icon-button"
            type="button"
            aria-label={`Edit ${item.name}`}
            title={`Edit ${item.name}`}
            disabled={busy}
            onClick={() => {
              setEditError("");
              setEditing({ item, kind });
            }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m16 3 5 5-12 12-6 1 1-6L16 3Z" />
              <path d="m13 6 5 5" />
            </svg>
          </button>
        )}
        {isAdmin && (
          <button
            className="button button-secondary taxonomy-icon-button"
            type="button"
            aria-label="Delete"
            title={`Delete ${item.name}`}
            disabled={busy}
            onClick={() => setDeleting({ item, kind })}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
            </svg>
          </button>
        )}
        {kind === "categories" && (
          <div
            id={`category-tags-${item.id}`}
            className="taxonomy-tags"
            hidden={!expanded}
          >
            {categoryTags.length ? (
              <ul>{categoryTags.map((tag) => entry(tag, "tags"))}</ul>
            ) : (
              <p className="muted">
                {isAdmin
                  ? "No tags in this category yet."
                  : "You haven’t created any tags in this category yet."}
              </p>
            )}
          </div>
        )}
      </li>
    );
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Organize your ideas</p>
          <h1>Categories & tags</h1>
        </div>
      </div>
      <p className="muted">
        Create topics for your stories.{" "}
        {isAdmin
          ? "Click a category to view its tags. You can manage all entries."
          : "Click a category to view your tags. Categories you created or added tags to appear below. You can rename your own entries and create tags under any category."}
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}{" "}
          <button
            className="text-link"
            onClick={() => {
              setError("");
              void refetch();
            }}
          >
            Retry loading
          </button>
        </p>
      )}
      <div className="taxonomy-create">
        <form
          className="card stack"
          onSubmit={categoryForm.handleSubmit((values) =>
            save(values, "categories"),
          )}
        >
          <h2>New category</h2>
          <label>
            Name
            <input
              className="form-control"
              {...categoryForm.register("name")}
              required
              maxLength={100}
            />
          </label>
          <button className="button button-primary" disabled={busy || loading}>
            Create category
          </button>
        </form>
        <form
          className="card stack"
          onSubmit={tagForm.handleSubmit((values) => save(values, "tags"))}
        >
          <h2>New tag</h2>
          <label>
            Category
            <select
              className="form-control"
              {...tagForm.register("categoryId")}
              required
              defaultValue=""
            >
              <option value="" disabled>
                Select a category
              </option>
              {categories.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input
              className="form-control"
              {...tagForm.register("name")}
              required
              maxLength={100}
            />
          </label>
          <button
            className="button button-primary"
            disabled={busy || loading || !categories.length}
          >
            Create tag
          </button>
        </form>
      </div>
      {loading ? (
        <p className="loading-state" role="status">
          Loading categories and tags…
        </p>
      ) : (
        <section className="taxonomy-section">
          <h2>
            Categories{" "}
            <span className="muted">({visibleCategories.length})</span>
          </h2>
          {visibleCategories.length ? (
            <ul>
              {visibleCategories.map((item) => entry(item, "categories"))}
            </ul>
          ) : (
            <p className="muted">Create your first category above.</p>
          )}
        </section>
      )}
      {editing && (
        <dialog
          ref={editDialog}
          className="confirm-dialog"
          aria-labelledby="edit-taxonomy-title"
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) setEditing(null);
          }}
        >
          <form
            className="stack"
            onSubmit={editForm.handleSubmit((values) =>
              save(values, editing.kind, editing.item.id),
            )}
          >
            <h2 id="edit-taxonomy-title">
              Edit {editing.kind === "categories" ? "category" : "tag"}
            </h2>
            <label>
              Name
              <input
                className="form-control"
                {...editForm.register("name")}
                required
                maxLength={100}
                defaultValue={editing.item.name}
                disabled={busy}
              />
            </label>
            {editError && (
              <p className="notice" role="alert">
                {editError}
              </p>
            )}
            <div className="actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={busy}
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </dialog>
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.item.name}?`}
          message={
            deleting.kind === "categories"
              ? "This permanently deletes the category and all its tags. Stories are preserved and become Uncategorized. This cannot be undone."
              : "This permanently deletes the tag and removes it from all stories. Stories are preserved."
          }
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            setBusy(true);
            setError("");
            try {
              await deleteTaxonomy({
                kind: deleting.kind,
                id: deleting.item.id,
              }).unwrap();
              toast.success("Deleted successfully.");
            } catch (failure) {
              const message = errorMessage(failure);
              setError(message);
              toast.error(message);
            } finally {
              setBusy(false);
              setDeleting(null);
            }
          }}
        />
      )}
    </>
  );
}

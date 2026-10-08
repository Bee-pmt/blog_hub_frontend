"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Category, Tag, errorMessage } from "@/lib/api";
import { useAuth } from "./auth-provider";
import ConfirmDialog from "./confirm-dialog";
export default function TaxonomyManager() {
  const { user, api } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [editing, setEditing] = useState<{
    item: Category;
    kind: "categories" | "tags";
  } | null>(null);
  const [editError, setEditError] = useState("");
  const editDialog = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState<{
    item: Category;
    kind: "categories" | "tags";
  } | null>(null);
  const visibleTags = tags.filter(
    (item) => user?.role === "admin" || item.createdById === user?.id,
  );
  const visibleCategories = categories.filter(
    (item) => user?.role === "admin" || item.createdById === user?.id ||
      visibleTags.some((tag) => tag.categoryId === item.id),
  );
  useEffect(() => {
    if (!editing) return;
    const dialog = editDialog.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>("input")?.select();
    return () => dialog?.close();
  }, [editing]);
  useEffect(() => {
    // Loading state belongs to this remote request, including filter changes and retries.
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    Promise.all([api<Category[]>("/categories"), api<Tag[]>("/tags")])
      .then(([nextCategories, nextTags]) => {
        if (active) {
          setCategories(nextCategories);
          setTags(nextTags);
        }
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, revision]);
  async function save(
    event: React.FormEvent<HTMLFormElement>,
    kind: "categories" | "tags",
    id?: string,
  ) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get("name") || "").trim();
    if (!name || !/[\p{L}\p{N}]/u.test(name)) {
      if (id) setEditError("Use a name containing at least one letter or number.");
      else setError("Use a name containing at least one letter or number.");
      toast.error("Use a name containing at least one letter or number.");
      return;
    }
    setBusy(true);
    setError("");
    setEditError("");
    try {
      await api(`/${kind}${id ? `/${id}` : ""}`, {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify({
          name,
          ...(!id && kind === "tags"
            ? { categoryId: values.get("categoryId") }
            : {}),
        }),
      });
      if (!id) form.reset();
      else setEditing(null);
      toast.success(
        id
          ? "Name updated. Discovery links now use the new slug."
          : "Created successfully.",
      );
      setRevision((value) => value + 1);
    } catch (failure) {
      if (id) setEditError(errorMessage(failure));
      else setError(errorMessage(failure));
      toast.error(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  function entry(item: Category, kind: "categories" | "tags") {
    const editable = user?.role === "admin" || item.createdById === user?.id;
    const categoryTags = kind === "categories"
      ? visibleTags.filter((tag) => tag.categoryId === item.id) : [];
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
              onClick={() => setExpandedCategories((current) =>
                current.includes(item.id)
                  ? current.filter((id) => id !== item.id)
                  : [...current, item.id],
              )}
            >
              <span className="taxonomy-chevron" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
              <strong>{item.name}</strong>
              <span className="muted">({categoryTags.length} {categoryTags.length === 1 ? "tag" : "tags"})</span>
            </button>
          ) : <strong>{item.name}</strong>}
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
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m16 3 5 5-12 12-6 1 1-6L16 3Z" />
                <path d="m13 6 5 5" />
              </svg>
            </button>
        )}
        {user?.role === "admin" && (
          <button
            className="button button-secondary taxonomy-icon-button"
            type="button"
            aria-label="Delete"
            title={`Delete ${item.name}`}
            disabled={busy}
            onClick={() => setDeleting({ item, kind })}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
            </svg>
          </button>
        )}
        {kind === "categories" && (
          <div id={`category-tags-${item.id}`} className="taxonomy-tags" hidden={!expanded}>
            {categoryTags.length ? (
              <ul>{categoryTags.map((tag) => entry(tag, "tags"))}</ul>
            ) : (
              <p className="muted">
                {user?.role === "admin" ? "No tags in this category yet." : "You haven’t created any tags in this category yet."}
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
        {user?.role === "admin"
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
              setRevision((value) => value + 1);
            }}
          >
            Retry loading
          </button>
        </p>
      )}
      <div className="taxonomy-create">
        <form
          className="card stack"
          onSubmit={(event) => void save(event, "categories")}
        >
          <h2>New category</h2>
          <label>
            Name
            <input
              className="form-control"
              name="name"
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
          onSubmit={(event) => void save(event, "tags")}
        >
          <h2>New tag</h2>
          <label>
            Category
            <select
              className="form-control"
              name="categoryId"
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
              name="name"
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
        <>
          <section className="taxonomy-section">
            <h2>
              Categories <span className="muted">({visibleCategories.length})</span>
            </h2>
            {visibleCategories.length ? (
              <ul>{visibleCategories.map((item) => entry(item, "categories"))}</ul>
            ) : (
              <p className="muted">Create your first category above.</p>
            )}
          </section>
        </>
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
          <form className="stack" onSubmit={(event) => void save(event, editing.kind, editing.item.id)}>
            <h2 id="edit-taxonomy-title">Edit {editing.kind === "categories" ? "category" : "tag"}</h2>
            <label>
              Name
              <input
                className="form-control"
                name="name"
                required
                maxLength={100}
                defaultValue={editing.item.name}
                disabled={busy}
              />
            </label>
            {editError && <p className="notice" role="alert">{editError}</p>}
            <div className="actions">
              <button type="button" className="button button-secondary" disabled={busy} onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={busy}>
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
              await api(`/${deleting.kind}/${deleting.item.id}`, {
                method: "DELETE",
              });
              toast.success("Deleted successfully.");
              setRevision((value) => value + 1);
            } catch (failure) {
              setError(errorMessage(failure));
              toast.error(errorMessage(failure));
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

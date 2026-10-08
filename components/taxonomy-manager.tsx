"use client";
import { useEffect, useState } from "react";
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
  const [deleting, setDeleting] = useState<{
    item: Category;
    kind: "categories" | "tags";
  } | null>(null);
  const visibleCategories = categories.filter(
    (item) => user?.role === "admin" || item.createdById === user?.id,
  );
  const visibleTags = tags.filter(
    (item) => user?.role === "admin" || item.createdById === user?.id,
  );
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
      setError("Use a name containing at least one letter or number.");
      toast.error("Use a name containing at least one letter or number.");
      return;
    }
    setBusy(true);
    setError("");
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
      toast.success(
        id
          ? "Name updated. Discovery links now use the new slug."
          : "Created successfully.",
      );
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(errorMessage(failure));
      toast.error(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  function entry(item: Category, kind: "categories" | "tags") {
    const editable = user?.role === "admin" || item.createdById === user?.id;
    return (
      <li key={item.id} className="taxonomy-row">
        <div>
          <strong>{item.name}</strong>
          <p className="field-help">
            /{item.slug}
            {kind === "tags" &&
              ` · ${categories.find((category) => category.id === (item as Tag).categoryId)?.name || "Category unavailable"}`}
          </p>
        </div>
        {editable && (
          <form
            className="rename-form"
            onSubmit={(event) => void save(event, kind, item.id)}
          >
            <input
              className="form-control"
              aria-label={`Rename ${item.name}`}
              name="name"
              required
              maxLength={100}
              defaultValue={item.name}
              key={item.name}
            />
            <button className="button button-secondary" disabled={busy}>
              Rename
            </button>
          </form>
        )}
        {user?.role === "admin" && (
          <button
            className="text-link"
            disabled={busy}
            onClick={() => setDeleting({ item, kind })}
          >
            Delete
          </button>
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
          ? "You can manage all entries."
          : "Only categories and tags you created are shown here. You can rename your entries."}
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
              {visibleCategories.map((item) => (
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
            disabled={busy || loading || !visibleCategories.length}
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
          <section className="taxonomy-section">
            <h2>
              Tags <span className="muted">({visibleTags.length})</span>
            </h2>
            {visibleTags.length ? (
              <ul>{visibleTags.map((item) => entry(item, "tags"))}</ul>
            ) : (
              <p className="muted">No tags yet. Tags belong to a category.</p>
            )}
          </section>
        </>
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

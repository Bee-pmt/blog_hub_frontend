"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Blog,
  BlogInput,
  Category,
  Tag,
  dateLabel,
  errorMessage,
} from "@/lib/api";
import { needsSourceMode, validatePost } from "@/lib/editor";
import { useAuth } from "./auth-provider";
import RichEditor from "./rich-editor";
import Markdown from "./markdown";
import BlogImage from "./blog-image";
import ConfirmDialog from "./confirm-dialog";

type Draft = {
  title: string;
  content: string;
  categoryId: string;
  tagIds: string[];
  coverImageUrl: string;
};
const emptyDraft: Draft = {
  title: "",
  content: "",
  categoryId: "",
  tagIds: [],
  coverImageUrl: "",
};
type Recovery = { draft: Draft; savedAt: string; baseUpdatedAt: string | null };
function readRecovery(value: string | null): Recovery | null {
  try {
    const copy = JSON.parse(value || "null");
    const draft = copy?.draft;
    if (
      draft &&
      typeof draft.title === "string" &&
      typeof draft.content === "string" &&
      typeof draft.categoryId === "string" &&
      typeof draft.coverImageUrl === "string" &&
      Array.isArray(draft.tagIds) &&
      draft.tagIds.every((id: unknown) => typeof id === "string") &&
      typeof copy.savedAt === "string" &&
      Number.isFinite(Date.parse(copy.savedAt))
    )
      return copy;
  } catch {
    /* Invalid recovery data is ignored. */
  }
  return null;
}

export default function PostEditor({
  id,
  admin = false,
}: {
  id?: string;
  admin?: boolean;
}) {
  const { user, api } = useAuth();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [post, setPost] = useState<Blog | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [mode, setMode] = useState<"visual" | "source" | "preview">("visual");
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [visualVersion, setVisualVersion] = useState(0);
  const [baseline, setBaseline] = useState(JSON.stringify(emptyDraft));
  const leaveAllowed = useRef(false);
  const saveRunning = useRef(false);
  const storageKey = `bloghub-recovery:${user?.id}:${id || "new"}`;
  const dirty = !loading && JSON.stringify(draft) !== baseline;
  useEffect(() => {
    // Loading state belongs to this remote request, including filter changes and retries.
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError("");
    Promise.all([
      api<Category[]>("/categories"),
      api<Tag[]>("/tags"),
      id
        ? api<Blog>(`${admin ? "/admin" : "/me"}/blogs/${id}`)
        : Promise.resolve(null),
    ])
      .then(([nextCategories, nextTags, nextPost]) => {
        if (!active) return;
        const initial = nextPost
          ? {
              title: nextPost.title,
              content: nextPost.content,
              categoryId: nextPost.categoryId || "",
              tagIds: nextPost.tags.map((tag) => tag.id),
              coverImageUrl: nextPost.coverImageUrl || "",
            }
          : { ...emptyDraft, tagIds: [] };
        setCategories(nextCategories);
        setTags(nextTags);
        setPost(nextPost);
        setDraft(initial);
        setBaseline(JSON.stringify(initial));
        setMode(needsSourceMode(initial.content) ? "source" : "visual");
        setVisualVersion((value) => value + 1);
        try {
          const copy = readRecovery(localStorage.getItem(storageKey));
          setRecovery(
            copy && JSON.stringify(copy.draft) !== JSON.stringify(initial)
              ? copy
              : null,
          );
        } catch {
          setNotice(
            "Browser recovery is unavailable. Save your work regularly.",
          );
        }
      })
      .catch((failure) => {
        if (active) setLoadError(errorMessage(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, id, admin, revision, storageKey]);
  useEffect(() => {
    if (!dirty || recovery || leaveAllowed.current) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            draft,
            savedAt: new Date().toISOString(),
            baseUpdatedAt: post?.updatedAt || null,
          }),
        );
      } catch {
        setNotice("Browser recovery is unavailable. Save your work regularly.");
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [dirty, draft, recovery, storageKey, post?.updatedAt]);
  useEffect(() => {
    if (!dirty) return;
    const persist = () => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            draft,
            savedAt: new Date().toISOString(),
            baseUpdatedAt: post?.updatedAt || null,
          }),
        );
      } catch {
        /* Recovery may be blocked by browser storage settings. */
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (leaveAllowed.current) return;
      persist();
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      if (leaveAllowed.current || event.defaultPrevented || event.button !== 0)
        return;
      const link = (event.target as Element).closest(
        "a[href]",
      ) as HTMLAnchorElement | null;
      const signingOut = (event.target as Element).closest(
        "[data-leave-editor]",
      );
      if (
        !signingOut &&
        (!link ||
          link.target === "_blank" ||
          link.hasAttribute("download") ||
          (link.pathname === window.location.pathname &&
            link.search === window.location.search))
      )
        return;
      if (
        !window.confirm(
          "You have unsaved changes. Leave this story? Your browser recovery copy will remain.",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      } else persist();
    };
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    const traverse = (event: Event) => {
      const change = event as Event & {
        navigationType?: string;
        destination?: { url: string };
      };
      if (
        leaveAllowed.current ||
        change.navigationType !== "traverse" ||
        !event.cancelable
      )
        return;
      if (
        change.destination &&
        new URL(change.destination.url).pathname === window.location.pathname
      )
        return;
      if (
        !window.confirm(
          "You have unsaved changes. Leave this story? Your browser recovery copy will remain.",
        )
      )
        event.preventDefault();
      else persist();
    };
    navigation?.addEventListener("navigate", traverse);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      navigation?.removeEventListener("navigate", traverse);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty, draft, storageKey, post?.updatedAt]);
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    if (draft[key] === value) return;
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice("");
  }
  async function save(status: Blog["status"]) {
    if (saveRunning.current || recovery) return;
    const input: BlogInput = {
      title: draft.title.trim(),
      content: draft.content,
      ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
      tagIds: draft.tagIds,
      coverImageUrl: draft.coverImageUrl.trim() || null,
      status,
    };
    const validation = validatePost(input, !id);
    if (validation) {
      setError(validation);
      return;
    }
    if (
      input.tagIds.some(
        (tagId) =>
          !tags.some(
            (tag) => tag.id === tagId && tag.categoryId === draft.categoryId,
          ),
      )
    ) {
      setError(
        "Some selected tags no longer belong to this category. Update your selection.",
      );
      return;
    }
    saveRunning.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            draft,
            savedAt: new Date().toISOString(),
            baseUpdatedAt: post?.updatedAt || null,
          }),
        );
      } catch {
        /* Server saving still works without local storage. */
      }
      const saved = await api<Blog>(id ? `/blogs/${id}` : "/blogs", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(input),
      });
      const nextDraft = {
        ...draft,
        title: saved.title,
        content: saved.content,
        categoryId: saved.categoryId || "",
        tagIds: saved.tags.map((tag) => tag.id),
        coverImageUrl: saved.coverImageUrl || "",
      };
      setBaseline(JSON.stringify(nextDraft));
      setDraft(nextDraft);
      setPost(saved);
      setVisualVersion((value) => value + 1);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* No recovery storage. */
      }
      setNotice(
        status === "published" ? "Your story is published." : "Draft saved.",
      );
      window.dispatchEvent(new Event("bloghub-posts-changed"));
      if (!id) {
        leaveAllowed.current = true;
        router.replace(`/dashboard/posts/${saved.id}/edit`);
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      saveRunning.current = false;
      setBusy(false);
    }
  }
  if (loading)
    return (
      <p className="loading-state" role="status">
        Opening the editor…
      </p>
    );
  if (loadError)
    return (
      <div className="empty-state">
        <h1>Unable to open this story.</h1>
        <p role="alert">{loadError}</p>
        <button
          className="button button-secondary"
          onClick={() => setRevision((value) => value + 1)}
        >
          Try again
        </button>
        <Link href="/dashboard" className="text-link">
          Back to stories
        </Link>
      </div>
    );
  const sourceOnly = needsSourceMode(draft.content);
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {post
              ? post.status === "published"
                ? "Published story"
                : "Work in progress"
              : "A fresh page"}
          </p>
          <h1>{post ? "Edit your story" : "Write your story"}</h1>
        </div>
        {post && (
          <span className="muted">Updated {dateLabel(post.updatedAt)}</span>
        )}
      </div>
      {admin && post && (
        <p className="notice">
          Editing {post.author.displayName}’s story. The author and story URL
          stay the same.
        </p>
      )}
      {recovery && (
        <div className="notice" role="status">
          <strong>Unsaved writing found.</strong>
          <p>
            Browser copy from {dateLabel(recovery.savedAt)}.
            {recovery.baseUpdatedAt &&
            recovery.baseUpdatedAt !== post?.updatedAt
              ? " This story has also changed on the server. Review carefully before saving."
              : ""}
          </p>
          <div className="actions">
            <button
              className="button button-secondary"
              onClick={() => {
                const validCategory = categories.some(
                  (category) => category.id === recovery.draft.categoryId,
                );
                const restored = {
                  ...recovery.draft,
                  categoryId: validCategory ? recovery.draft.categoryId : "",
                  tagIds: recovery.draft.tagIds.filter((tagId) =>
                    tags.some(
                      (tag) =>
                        tag.id === tagId &&
                        tag.categoryId === recovery.draft.categoryId &&
                        validCategory,
                    ),
                  ),
                };
                setDraft(restored);
                setMode(
                  needsSourceMode(restored.content) ? "source" : "visual",
                );
                setVisualVersion((value) => value + 1);
                setRecovery(null);
              }}
            >
              Restore writing
            </button>
            <button
              className="text-link"
              onClick={() => {
                try {
                  localStorage.removeItem(storageKey);
                } catch {
                  /* Storage unavailable. */
                }
                setRecovery(null);
              }}
            >
              Discard browser copy
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <fieldset className="editor-fields" disabled={busy || !!recovery}>
        <label className="title-label">
          Story title
          <input
            className="form-control title-input"
            value={draft.title}
            maxLength={200}
            placeholder="Give your idea a title"
            onChange={(event) => update("title", event.target.value)}
          />
        </label>
        <div className="editor-metadata">
          <label>
            Category
            <select
              className="form-control"
              value={draft.categoryId}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  categoryId: event.target.value,
                  tagIds: [],
                }));
              }}
            >
              <option value="" disabled={!!post?.categoryId}>
                {id ? "Uncategorized" : "Select a category"}
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cover image URL <span className="muted">(optional)</span>
            <input
              className="form-control"
              type="url"
              value={draft.coverImageUrl}
              maxLength={2048}
              placeholder="https://…"
              onChange={(event) => update("coverImageUrl", event.target.value)}
            />
          </label>
        </div>
        {draft.coverImageUrl && (
          <BlogImage src={draft.coverImageUrl} className="editor-cover" />
        )}
        <fieldset className="tags-field">
          <legend>
            Tags <span className="muted">({draft.tagIds.length}/10)</span>
          </legend>
          <div className="tag-list">
            {tags
              .filter((tag) => tag.categoryId === draft.categoryId)
              .map((tag) => (
                <label className="tag-choice" key={tag.id}>
                  <input
                    type="checkbox"
                    checked={draft.tagIds.includes(tag.id)}
                    disabled={
                      busy ||
                      !!recovery ||
                      (!draft.tagIds.includes(tag.id) &&
                        draft.tagIds.length >= 10)
                    }
                    onChange={(event) =>
                      update(
                        "tagIds",
                        event.target.checked
                          ? [...draft.tagIds, tag.id]
                          : draft.tagIds.filter((value) => value !== tag.id),
                      )
                    }
                  />
                  {tag.name}
                </label>
              ))}
          </div>
          {!draft.categoryId && (
            <p className="field-help">Select a category to add tags.</p>
          )}
        </fieldset>
      </fieldset>
      {sourceOnly && (
        <p className="field-help">
          This story contains formatting best kept in Markdown source. Preview
          shows how it will read.
        </p>
      )}
      <div className="tabs" aria-label="Editor mode">
        {(["visual", "source", "preview"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={mode === value}
            disabled={busy || !!recovery || (value === "visual" && sourceOnly)}
            onClick={() => {
              setMode(value);
              if (value === "visual")
                setVisualVersion((current) => current + 1);
            }}
          >
            {value === "source"
              ? "Markdown source"
              : value === "visual"
                ? "Visual"
                : "Preview"}
          </button>
        ))}
      </div>
      {mode === "source" ? (
        <label className="stack">
          Story content
          <textarea
            className="form-control source-editor"
            value={draft.content}
            disabled={busy || !!recovery}
            maxLength={100000}
            onChange={(event) => update("content", event.target.value)}
            spellCheck={false}
          />
        </label>
      ) : mode === "preview" ? (
        <div className="preview-panel">
          <h2>{draft.title || "Untitled story"}</h2>
          <Markdown content={draft.content} />
        </div>
      ) : (
        <RichEditor
          key={visualVersion}
          content={draft.content}
          disabled={busy || !!recovery}
          onChange={(content) => update("content", content)}
        />
      )}
      <div className="editor-save">
        <p className="field-help">
          {dirty
            ? "Unsaved changes"
            : post
              ? "All changes saved"
              : "Start writing"}{" "}
          · {draft.content.length.toLocaleString()} / 100,000 characters
        </p>
        <div className="actions">
          <button
            className="button button-secondary"
            disabled={busy || !!recovery}
            onClick={() => void save(post?.status || "draft")}
          >
            {busy
              ? "Saving…"
              : post?.status === "published"
                ? "Save changes"
                : "Save draft"}
          </button>
          <button
            className="button button-primary"
            disabled={busy || !!recovery}
            onClick={() =>
              void save(post?.status === "published" ? "draft" : "published")
            }
          >
            {post?.status === "published" ? "Unpublish" : "Publish"}
          </button>
          {post && (
            <button
              className="text-link"
              disabled={busy || !!recovery}
              onClick={() => setDeleting(true)}
            >
              Delete
            </button>
          )}
          {post?.status === "published" && (
            <Link
              className="text-link"
              href={`/blogs/${encodeURIComponent(post.slug)}`}
            >
              Read story ↗
            </Link>
          )}
        </div>
      </div>
      {deleting && (
        <ConfirmDialog
          title="Delete this story?"
          message="This permanently removes the story and your browser recovery copy. This cannot be undone."
          busy={busy}
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            if (saveRunning.current) return;
            saveRunning.current = true;
            setBusy(true);
            setError("");
            try {
              await api(`/blogs/${id}`, { method: "DELETE" });
              try {
                localStorage.removeItem(storageKey);
              } catch {
                /* Storage unavailable. */
              }
              leaveAllowed.current = true;
              router.replace(admin ? "/dashboard/admin/posts" : "/dashboard");
              window.dispatchEvent(new Event("bloghub-posts-changed"));
            } catch (failure) {
              setError(errorMessage(failure));
            } finally {
              saveRunning.current = false;
              setBusy(false);
              setDeleting(false);
            }
          }}
        />
      )}
    </>
  );
}

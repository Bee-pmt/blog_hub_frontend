"use client";
import type { Blog, BlogInput, Draft, Recovery } from "@/types/models";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { dateLabel, errorMessage, blogImageUrl } from "@/lib/api";
import { useDraftRecovery } from "./use-draft-recovery";
import { needsSourceMode, validatePost } from "./editor-validation";
import {
  useAuth,
  useBlogStore,
  useTaxonomyStore,
} from "@/features/auth/auth-provider";
import RichEditor from "./rich-editor";
import Markdown from "./markdown";
import BlogImage from "./blog-image";
import ConfirmDialog from "@/components/confirm-dialog";

const emptyDraft: Draft = {
  title: "",
  content: "",
  categoryId: "",
  tagIds: [],
  coverImageUrl: "",
};

type PostEditorProps = {
  id?: string;
  admin?: boolean;
};

export default function PostEditor({ id, admin = false }: PostEditorProps) {
  const user = useAuth((state) => state.user);
  const api = useAuth((state) => state.api);
  const contentApi = useAuth((state) => state.contentApi);
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [post, setPost] = useState<Blog | null>(null);
  const categories = useTaxonomyStore((state) => state.categories);
  const tags = useTaxonomyStore((state) => state.tags);
  const loadTaxonomy = useTaxonomyStore((state) => state.load);
  const loadBlog = useBlogStore((state) => state.loadBlog);
  const saveBlog = useBlogStore((state) => state.save);
  const deleteBlog = useBlogStore((state) => state.remove);
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const saveRunning = useRef(false);
  const storageKey = `bloghub-recovery:${user?.id}:${id || "new"}`;
  const dirty = !loading && (JSON.stringify(draft) !== baseline || !!imageFile);
  const { allowLeave, readRecovery, persistRecovery, clearRecovery } =
    useDraftRecovery({
      storageKey,
      draft,
      dirty,
      waitingForRecovery: !!recovery,
      baseUpdatedAt: post?.updatedAt || null,
      onError: setNotice,
    });
  useEffect(() => {
    const preview = imageFile ? URL.createObjectURL(imageFile) : "";
    // The preview exists only while this local file is selected.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImagePreview(preview);
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [imageFile]);
  useEffect(() => {
    // Loading state belongs to this remote request, including filter changes and retries.
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError("");
    Promise.all([
      loadTaxonomy(revision > 0),
      id ? loadBlog(id, admin, api, revision > 0) : Promise.resolve(null),
    ])
      .then(([, nextPost]) => {
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
        setPost(nextPost);
        setImageFile(null);
        setDraft(initial);
        setBaseline(JSON.stringify(initial));
        setMode(needsSourceMode(initial.content) ? "source" : "visual");
        setVisualVersion((value) => value + 1);
        setRecovery(readRecovery(initial));
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
  }, [api, id, admin, revision, readRecovery, loadTaxonomy, loadBlog]);
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
      ...(!imageFile && draft.coverImageUrl !== (post?.coverImageUrl || "")
        ? {
            coverImageUrl:
              blogImageUrl(draft.coverImageUrl.trim()) ||
              draft.coverImageUrl.trim() ||
              null,
          }
        : {}),
      status,
    };
    const validation = validatePost(input, !id);
    if (validation) {
      setError(validation);
      toast.error(validation);
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
      toast.error(
        "Some selected tags no longer belong to this category. Update your selection.",
      );
      return;
    }
    saveRunning.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      persistRecovery();
      const saved = await saveBlog(input, id, imageFile, contentApi);
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
      setImageFile(null);
      if (imageInput.current) imageInput.current.value = "";
      setVisualVersion((value) => value + 1);
      clearRecovery();
      toast.success(
        status === "published" ? "Your story is published." : "Draft saved.",
        { id: "post-save" },
      );
      if (!id) {
        allowLeave();
        router.replace(`/dashboard/posts/${saved.id}/edit`);
      }
    } catch (failure) {
      setError(errorMessage(failure));
      toast.error(errorMessage(failure));
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
                clearRecovery();
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
            Cover image <span className="muted">(optional)</span>
            <input
              ref={imageInput}
              className="form-control"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (
                  !["image/jpeg", "image/png", "image/webp"].includes(file.type)
                ) {
                  setError("Choose a JPEG, PNG, or WebP image.");
                  toast.error("Choose a JPEG, PNG, or WebP image.");
                  event.target.value = "";
                  return;
                }
                if (!file.size || file.size > 5 * 1024 * 1024) {
                  setError("Choose a non-empty image of up to 5 MB.");
                  toast.error("Choose a non-empty image of up to 5 MB.");
                  event.target.value = "";
                  return;
                }
                setImageFile(file);
                setError("");
                setNotice("");
              }}
            />
          </label>
        </div>
        <p className="field-help">
          JPEG, PNG, or WebP · Up to 5 MB. Your image uploads when you save or
          publish.
          {imageFile && " Reselect the image if you reload before saving."}
        </p>
        {imagePreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagePreview}
            alt="Selected cover preview"
            className="editor-cover"
          />
        ) : draft.coverImageUrl ? (
          <BlogImage
            src={draft.coverImageUrl}
            alt="Story cover"
            className="editor-cover"
          />
        ) : null}
        {(imageFile || draft.coverImageUrl) && (
          <div className="actions">
            {imageFile && (
              <span className="field-help">Selected: {imageFile.name}</span>
            )}
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setImageFile(null);
                update("coverImageUrl", "");
                if (imageInput.current) imageInput.current.value = "";
              }}
            >
              Remove cover image
            </button>
          </div>
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
        {post?.publicationBlocked && (
          <p className="notice" role="status">
            Unpublished by an admin. You can edit and save this draft, but only
            an admin can publish it again.
          </p>
        )}
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
            disabled={busy || !!recovery || !!post?.publicationBlocked}
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
            if (!id || saveRunning.current) return;
            saveRunning.current = true;
            setBusy(true);
            setError("");
            try {
              await deleteBlog(id, contentApi);
              clearRecovery();
              allowLeave();
              toast.success("Story deleted.");
              router.replace(admin ? "/dashboard/admin/posts" : "/dashboard");
            } catch (failure) {
              setError(errorMessage(failure));
              toast.error(errorMessage(failure));
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

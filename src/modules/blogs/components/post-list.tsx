"use client";

import type { Blog, BlogPage, BlogSummary, Filters } from "@/modules/blogs/types";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAppStore } from "@/lib/store/hooks";
import Link from "next/link";
import dynamic from "next/dynamic";
import { SquarePen } from "lucide-react";
import { toast } from "sonner";
import { dateLabel, queryString } from "@/lib/utils";
import { queryError } from "@/lib/api/baseApi";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import ConfirmDialog from "@/modules/base/components/confirm-dialog";
import BlogImage from "./blog-image";
import ReactionButtons from "./reaction-buttons";
import { blogApi, useGetFeedInfiniteQuery, useChangeBlogStatusMutation, useDeleteBlogMutation } from "../store/services/blogApi";

const PostEditor = dynamic(() => import("./post-editor"), {
  loading: () => <p role="status">Opening the editor…</p>,
});

function FeedPost({ post }: { post: BlogSummary }) {
  const { user } = useAuth();
  const [changeStatus, statusState] = useChangeBlogStatusMutation();
  const [deletePost, deleteState] = useDeleteBlogMutation();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const menu = useRef<HTMLDetailsElement>(null);
  const pending = useRef(false);
  const busy = statusState.isLoading || deleteState.isLoading;
  const href = `/blogs/${encodeURIComponent(post.slug)}`;

  async function mutate(remove: boolean) {
    if (pending.current) return;
    pending.current = true;
    setError("");
    if (menu.current) menu.current.open = false;
    try {
      if (remove) await deletePost({ id: post.id, version: post.version }).unwrap();
      else await changeStatus({ id: post.id, status: "draft", admin: false }).unwrap();
      toast.success(remove ? "Story moved to Trash." : "Story unpublished.");
    } catch (failure) {
      setError(queryError(failure));
    } finally {
      pending.current = false;
      setDeleting(false);
    }
  }

  return (
    <article className="post-card feed-card">
      <header className="feed-card-heading">
        <span className="feed-avatar" aria-hidden="true">{Array.from(post.author.displayName.trim())[0]?.toLocaleUpperCase() || "U"}</span>
        <div className="feed-author">
          <Link href={`/${queryString({ author: post.author.displayName })}#journal`}>{post.author.displayName}</Link>
          <div className="post-meta"><time dateTime={post.publishedAt || post.createdAt}>{dateLabel(post.publishedAt || post.createdAt)}</time><span>· {post.categoryName}</span></div>
        </div>
        {user?.id === post.author.id && (
          <details ref={menu} className="feed-menu" onKeyDown={(event) => {
            if (event.key === "Escape" && menu.current) {
              menu.current.open = false;
              menu.current.querySelector("summary")?.focus();
            }
          }}>
            <summary aria-label={`Post options for ${post.title}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="2" /><circle cx="12" cy="16" r="2" /></svg>
            </summary>
            <div className="feed-menu-items">
              <Link href={`/dashboard/posts/${post.id}/edit`}>Edit</Link>
              <button disabled={busy} onClick={() => void mutate(false)}>Unpublish</button>
              <button disabled={busy} onClick={() => { if (menu.current) menu.current.open = false; setDeleting(true); }}>Move to Trash</button>
            </div>
          </details>
        )}
      </header>
      <h3><Link href={href}>{post.title}</Link></h3>
      <p className="post-excerpt">{(post.excerpt || "")
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/<[^>]*>/g, "").replace(/[#*_`>~]/g, "")}</p>
      {post.coverImageUrl && <Link href={href} tabIndex={-1} aria-hidden="true"><BlogImage src={post.coverImageUrl} className="card-cover" /></Link>}
      <ReactionButtons kind="blogs" id={post.id} commentHref={`${href}#comments`} />
      {error && <p className="notice" role="alert">{error}</p>}
      {deleting && <ConfirmDialog title="Move this story to Trash?" confirmLabel="Move to Trash" busyLabel="Moving…" message={`“${post.title}” will move to Trash. You can manage it from My Trash.`}
        busy={busy} onCancel={() => setDeleting(false)} onConfirm={() => void mutate(true)} />}
    </article>
  );
}

export default function PostList({ data: initial, filters, startWriting = false, children, discovery }: {
  data: BlogPage;
  filters: Filters;
  startWriting?: boolean;
  children?: ReactNode;
  discovery?: ReactNode;
}) {
  const { user, loading, error: sessionError, restore } = useAuth();
  const store = useAppStore();
  const seeded = useRef(false);
  const [ready, setReady] = useState(false);
  const [editor, setEditor] = useState<{ id?: string } | null>(startWriting ? {} : null);
  const editorSection = useRef<HTMLDialogElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const writeButton = useRef<HTMLButtonElement>(null);
  const feed = useGetFeedInfiniteQuery(filters, { skip: !ready });
  const pages = feed.currentData?.pages ?? [initial];
  const posts = [...new Map(pages.flatMap((page) => page.items).map((post) => [post.id, post])).values()];
  const total = pages[0].total;
  const userId = user?.id;
  const { hasNextPage, isFetching, error: feedError, fetchNextPage } = feed;

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const cached = blogApi.endpoints.getFeed.select(filters)(store.getState());
    const seed = cached.data ? Promise.resolve() : store.dispatch(blogApi.util.upsertQueryData("getFeed", filters, { pages: [initial], pageParams: [1] }));
    void seed.then(() => setReady(true));
  }, [initial, filters, store]);

  useEffect(() => {
    const panel = editorSection.current;
    const header = document.querySelector(".site-header");
    const feedMain = sentinel.current?.closest<HTMLElement>(".feed-main");
    if (!header || !feedMain) return;
    const fitPanel = () => {
      const bounds = feedMain.getBoundingClientRect();
      feedMain.style.setProperty("--feed-center", `${bounds.left + bounds.width / 2}px`);
      feedMain.style.setProperty("--feed-width", `${bounds.width}px`);
      panel?.style.setProperty("--editor-top", `${header.getBoundingClientRect().bottom}px`);
      panel?.style.setProperty("--editor-width", `${bounds.width}px`);
      panel?.style.setProperty("--editor-left", `${bounds.left}px`);
    };
    fitPanel();
    if (editor && userId && panel && !panel.open) panel.showModal();
    const observer = new ResizeObserver(fitPanel);
    observer.observe(header);
    observer.observe(feedMain);
    return () => observer.disconnect();
  }, [editor, userId]);

  useEffect(() => {
    if (!ready || editor || !hasNextPage || isFetching || feedError || !sentinel.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
    }, { rootMargin: "250px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [ready, editor, hasNextPage, isFetching, feedError, fetchNextPage]);

  function closeEditor() {
    setEditor(null);
    requestAnimationFrame(() => writeButton.current?.focus({ preventScroll: true }));
  }

  function saved(post: Blog) {
    if (post.status === "published") closeEditor();
    else setEditor((current) => current?.id === post.id ? current : { id: post.id });
  }

  return (
    <div className="feed-layout">
      <div className="feed-main">
        <div className="feed-heading">
          <div><p className="eyebrow">The journal</p><h1>Explore Stories</h1><p className="muted">Discover ideas, experiences, and stories.</p></div>
          {user ? <button className="button button-primary feed-write-button" type="button" disabled={loading} onClick={event => { writeButton.current = event.currentTarget; setEditor({}); }}><SquarePen size={17} aria-hidden="true" />Write a Story</button>
            : <Link className="button button-primary feed-write-button" href={`/login?returnTo=${encodeURIComponent("/?write=1#feed-editor")}`}><SquarePen size={17} aria-hidden="true" />Write a Story</Link>}
        </div>
        {children}
      {editor && user && <dialog ref={editorSection} id="feed-editor" className="feed-editor" aria-label="Write blog" onCancel={(event) => {
        event.preventDefault();
        editorSection.current?.querySelector<HTMLButtonElement>("[data-leave-editor]")?.click();
      }}>
        <div className="feed-editor-content">
          <button className="text-link feed-editor-close" data-leave-editor type="button" onClick={closeEditor}>← Back to feed</button>
          <PostEditor key={`${user.id}:${user.role}:${editor.id || "new"}`} id={editor.id} onSaved={saved} />
        </div>
      </dialog>}
      <div className="feed-posts">
        <p className="result-count">{total} {total === 1 ? "story" : "stories"}</p>
        {posts.length ? <div className="post-grid feed-list">{posts.map((post) => <FeedPost key={post.id} post={post} />)}</div> : (
          <div className="empty-state"><h3>No stories found</h3><p>Try another search or clear the filters.</p><Link className="text-link" href="/#journal">See all stories</Link></div>
        )}
        {feed.error && <p className="notice" role="alert">{queryError(feed.error)}{" "}<button className="text-link" onClick={() => void (feed.isFetchNextPageError ? feed.fetchNextPage() : feed.refetch())}>Try again</button></p>}
        {feed.isFetching && <p role="status" className="loading-state">Loading stories…</p>}
        <div ref={sentinel} className="feed-sentinel">
          {feed.hasNextPage && !feed.isFetching && !feed.error && <button className="text-link" onClick={() => void feed.fetchNextPage()}>Load more stories</button>}
          {ready && !feed.hasNextPage && !feed.isFetching && !feed.error && !!posts.length && <p className="muted">You’re all caught up.</p>}
        </div>
      </div>
      {sessionError && <p className="notice" role="alert">{sessionError}{" "}<button className="text-link" onClick={() => void restore()}>Retry session check</button></p>}
      {(!editor || !user) && <div className="feed-composer">
        <span className="feed-avatar" aria-hidden="true">{Array.from(user?.displayName.trim() || "B")[0]?.toLocaleUpperCase()}</span>
        {user ? <button type="button" disabled={loading} onClick={event => { writeButton.current = event.currentTarget; setEditor({}); }}>Write blog <span aria-hidden="true">↗</span></button>
          : <Link href={`/login?returnTo=${encodeURIComponent("/?write=1#feed-editor")}`}>Write blog <span aria-hidden="true">↗</span></Link>}
      </div>}
      </div>
      {discovery}
    </div>
  );
}

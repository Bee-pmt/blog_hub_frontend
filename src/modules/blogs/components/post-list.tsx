"use client";

import type { Blog, BlogPage, BlogSummary, Filters } from "@/modules/blogs/types";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store/hooks";
import Link from "next/link";
import dynamic from "next/dynamic";
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
      if (remove) await deletePost(post.id).unwrap();
      else await changeStatus({ id: post.id, status: "draft", admin: false }).unwrap();
      toast.success(remove ? "Story deleted." : "Story unpublished.");
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
              <button disabled={busy} onClick={() => { if (menu.current) menu.current.open = false; setDeleting(true); }}>Delete</button>
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
      {deleting && <ConfirmDialog title="Delete this story?" message={`“${post.title}” will be permanently removed. This cannot be undone.`}
        busy={busy} onCancel={() => setDeleting(false)} onConfirm={() => void mutate(true)} />}
    </article>
  );
}

export default function PostList({ data: initial, filters, startWriting = false }: {
  data: BlogPage;
  filters: Filters;
  startWriting?: boolean;
}) {
  const { user, loading, error: sessionError, restore } = useAuth();
  const store = useAppStore();
  const seeded = useRef(false);
  const [ready, setReady] = useState(false);
  const [editor, setEditor] = useState<{ id?: string } | null>(startWriting ? {} : null);
  const editorSection = useRef<HTMLElement>(null);
  const feedSection = useRef<HTMLDivElement>(null);
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
    if (editor && userId) editorSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    feedSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => writeButton.current?.focus({ preventScroll: true }));
  }

  function saved(post: Blog) {
    if (post.status === "published") closeEditor();
    else setEditor((current) => current?.id === post.id ? current : { id: post.id });
  }

  return (
    <>
      {editor && user && <section ref={editorSection} id="feed-editor" className="feed-editor" aria-label="Write blog">
        <button className="text-link feed-editor-close" data-leave-editor type="button" onClick={closeEditor}>← Back to feed</button>
        <PostEditor key={`${user.id}:${user.role}:${editor.id || "new"}`} id={editor.id} onSaved={saved} />
      </section>}
      <div ref={feedSection} className="feed-posts">
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
        {user ? <button ref={writeButton} type="button" disabled={loading} onClick={() => setEditor({})}>Write blog <span aria-hidden="true">↗</span></button>
          : <Link href={`/login?returnTo=${encodeURIComponent("/?write=1#feed-editor")}`}>Write blog <span aria-hidden="true">↗</span></Link>}
      </div>}
    </>
  );
}

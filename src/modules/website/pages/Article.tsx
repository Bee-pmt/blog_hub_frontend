import type { ModulePageProps } from "@/moduleTypes";
import type { Blog } from "@/modules/blogs/types";
import { cache, Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, errorMessage } from "@/lib/api-client";
import { dateLabel, queryString } from "@/lib/utils";
import { getCachedBlog } from "@/modules/blogs/cache";
import Markdown from "@/modules/blogs/components/markdown";
import BlogImage from "@/modules/blogs/components/blog-image";
const getPost = cache(getCachedBlog);
export async function generateMetadata({ params }: ModulePageProps) {
  const { slug } = await params;
  try {
    const post = await getPost(slug);
    return {
      title: post.title,
      description: post.content.replace(/[#*_`>~]/g, "").slice(0, 160),
      openGraph: {
        title: post.title,
        type: "article" as const,
        publishedTime: post.publishedAt || undefined,
      },
    };
  } catch {
    return { title: "Story unavailable" };
  }
}
async function Article({ params }: ModulePageProps) {
  const { slug } = await params;
  let post: Blog;
  try {
    post = await getPost(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <div className="empty-state" role="alert">
        <h1>Unable to load this story.</h1>
        <p>{errorMessage(error)}</p>
        <a
          className="button button-secondary"
          href={`/blogs/${encodeURIComponent(slug)}`}
        >
          Try again
        </a>
      </div>
    );
  }
  return (
    <article className="article">
      <Link className="text-link muted" href="/#journal">
        ← Back to the journal
      </Link>
      <header className="article-header">
        <Link
          className="eyebrow"
          href={`/${queryString({ category: post.category?.slug })}#journal`}
        >
          {post.categoryName}
        </Link>
        <h1>{post.title}</h1>
        <p className="post-meta">
          <Link
            href={`/${queryString({ author: post.author.displayName })}#journal`}
          >
            By {post.author.displayName}
          </Link>
          <time dateTime={post.publishedAt || post.createdAt}>
            {dateLabel(post.publishedAt || post.createdAt)}
          </time>
        </p>
        <div className="tag-list">
          {post.tags.map((tag) => (
            <Link
              className="tag"
              key={tag.id}
              href={`/${queryString({ category: post.category?.slug, tag: tag.slug })}#journal`}
            >
              {tag.name}
            </Link>
          ))}
        </div>
      </header>
      {post.coverImageUrl && (
        <BlogImage src={post.coverImageUrl} className="article-cover" />
      )}
      <Markdown content={post.content} />
    </article>
  );
}
export default function ArticlePage(props: ModulePageProps) {
  return (
    <main id="main-content" className="site-container article-page">
      <Suspense
        fallback={
          <p className="loading-state" role="status">
            Opening your story…
          </p>
        }
      >
        <Article {...props} />
      </Suspense>
    </main>
  );
}

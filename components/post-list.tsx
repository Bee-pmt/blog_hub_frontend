import Link from "next/link";
import { BlogPage, Filters, dateLabel, queryString } from "@/lib/api";
import BlogImage from "./blog-image";

export default function PostList({
  data,
  filters,
}: {
  data: BlogPage;
  filters: Filters;
}) {
  return (
    <>
      <p className="result-count">
        {data.total} {data.total === 1 ? "story" : "stories"}
      </p>
      {data.items.length ? (
        <div className="post-grid">
          {data.items.map((post) => (
            <article className="post-card" key={post.id}>
              {post.coverImageUrl && (
                <Link
                  href={`/blogs/${encodeURIComponent(post.slug)}`}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <BlogImage src={post.coverImageUrl} className="card-cover" />
                </Link>
              )}
              <div className="post-meta">
                <Link
                  href={`/${queryString({ category: post.category?.slug })}#journal`}
                >
                  {post.categoryName}
                </Link>
                <span>{dateLabel(post.publishedAt || post.createdAt)}</span>
              </div>
              <h3>
                <Link href={`/blogs/${encodeURIComponent(post.slug)}`}>
                  {post.title}
                </Link>
              </h3>
              <p className="post-excerpt">
                {post.excerpt
                  .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
                  .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
                  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
                  .replace(/<[^>]*>/g, "")
                  .replace(/[#*_`>~]/g, "")}
              </p>
              <Link
                className="author-link"
                href={`/${queryString({ author: post.author.displayName })}#journal`}
              >
                By {post.author.displayName}
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h3>No stories found</h3>
          <p>Try another search or clear the filters.</p>
          <Link className="text-link" href="/#journal">
            See all stories
          </Link>
        </div>
      )}
      {data.totalPages > 1 && (
        <nav className="pagination" aria-label="Story pages">
          {data.page > 1 && (
            <Link
              href={`/${queryString({ ...filters, page: data.page - 1 })}#journal`}
            >
              Previous
            </Link>
          )}
          {Array.from(
            new Set([
              1,
              ...Array.from({ length: 5 }, (_, i) => data.page - 2 + i).filter(
                (n) => n > 1 && n < data.totalPages,
              ),
              data.totalPages,
            ]),
          )
            .sort((a, b) => a - b)
            .map((page, index, pages) => (
              <span key={page}>
                {index > 0 && page - pages[index - 1] > 1 && (
                  <span className="pagination-gap">…</span>
                )}
                <Link
                  aria-current={page === data.page ? "page" : undefined}
                  href={`/${queryString({ ...filters, page })}#journal`}
                >
                  {page}
                </Link>
              </span>
            ))}
          {data.page < data.totalPages && (
            <Link
              href={`/${queryString({ ...filters, page: data.page + 1 })}#journal`}
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

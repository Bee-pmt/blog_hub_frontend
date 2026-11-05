import type { ModulePageProps } from "@/moduleTypes";
import type { Category, Tag } from "@/modules/taxonomy/types";
import type { BlogPage, Filters } from "@/modules/blogs/types";
import { Suspense } from "react";
import Link from "next/link";
import { queryString } from "@/lib/utils";
import { errorMessage } from "@/lib/api-client";
import { getCachedBlogs } from "@/modules/blogs/cache";
import { getCachedTaxonomy } from "@/modules/taxonomy/cache";
import SearchFilters from "@/modules/blogs/components/search-filters";
import PostList from "@/modules/blogs/components/post-list";

async function Journal({ searchParams }: ModulePageProps) {
  const params = await searchParams;
  const filters: Filters = {};
  for (const key of ["q", "category", "tag", "author"] as const) {
    const value = params[key];
    if (typeof value === "string" && value.trim())
      filters[key] = value
        .trim()
        .slice(0, key === "author" ? 100 : key === "q" ? 200 : 500);
  }
  let result: [BlogPage, Category[], Tag[], BlogPage | null];
  try {
    const [blogs, taxonomy, recent] = await Promise.all([
      getCachedBlogs({ ...filters, page: 1, limit: 9 }),
      getCachedTaxonomy(),
      getCachedBlogs({ page: 1, limit: 3 }).catch(() => null),
    ]);
    result = [blogs, taxonomy.categories, taxonomy.tags, recent];
  } catch (error) {
    return (
      <div className="empty-state" role="alert">
        <h3>The journal is taking a moment.</h3>
        <p>{errorMessage(error)}</p>
        <a
          className="button button-secondary"
          href={`/${queryString(filters)}#journal`}
        >
          Try again
        </a>
      </div>
    );
  }
  const [data, categories, tags, recent] = result;
  return (
    <PostList key={`${queryString(filters)}:${params.write === "1"}`} data={data} filters={filters} startWriting={params.write === "1"}
      discovery={<aside className="discovery-panel" aria-label="Discover more">
        <section className="discovery-card">
          <p className="eyebrow">Find your next read</p><h2>Explore topics</h2>
          {categories.length ? <div className="discovery-topics">{categories.slice(0, 8).map(item => <Link key={item.id} href={`/${queryString({ category: item.slug })}#journal`} aria-label={`Explore ${item.name}`}>{item.name}</Link>)}</div> : <p className="muted">New topics will appear here.</p>}
        </section>
        <section className="discovery-card">
          <h2>Recently published</h2>
          {recent === null ? <p className="muted">Recent stories are unavailable right now.</p> : recent.items.length ? <ol className="recent-stories">{recent.items.map(post => <li key={post.id}>
            <p>{post.author.displayName}</p><Link href={`/blogs/${encodeURIComponent(post.slug)}`} aria-label={`Read ${post.title}`}>{post.title}</Link>
          </li>)}</ol> : <p className="muted">Published stories will appear here.</p>}
          <Link className="discovery-all" href="/#journal">Browse all stories <span aria-hidden="true">↗</span></Link>
        </section>
        <p className="discovery-note">A space for thoughtful stories.<br />Read something that stays with you.</p>
      </aside>}>
      <div className="category-discovery" aria-label="Discover categories">
        <Link
          href="/#journal"
          aria-current={!filters.category ? "page" : undefined}
        >
          All stories
        </Link>
        {categories.map((item) => (
          <Link
            key={item.id}
            href={`/${queryString({ category: item.slug })}#journal`}
            aria-current={filters.category === item.slug ? "page" : undefined}
          >
            {item.name}
          </Link>
        ))}
      </div>
      <SearchFilters
        key={queryString(filters)}
        categories={categories}
        tags={tags}
        filters={filters}
      />

    </PostList>
  );
}

export default function Home(props: ModulePageProps) {
  return (
    <main id="main-content" className="site-container feed-page">
      <section className="journal-section" id="journal">
        <Suspense fallback={<p className="loading-state" role="status">Gathering the latest stories…</p>}>
          <Journal {...props} />
        </Suspense>
      </section>
    </main>
  );
}

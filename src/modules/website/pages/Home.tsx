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
  let result: [BlogPage, Category[], Tag[]];
  try {
    const [blogs, taxonomy] = await Promise.all([
      getCachedBlogs({ ...filters, page: 1, limit: 9 }),
      getCachedTaxonomy(),
    ]);
    result = [blogs, taxonomy.categories, taxonomy.tags];
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
  const [data, categories, tags] = result;
  return (
    <>
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

      <PostList key={`${queryString(filters)}:${params.write === "1"}`} data={data} filters={filters} startWriting={params.write === "1"} />
    </>
  );
}

export default function Home(props: ModulePageProps) {
  return (
    <main id="main-content" className="site-container feed-page">
      <section className="journal-section" id="journal">
        <div className="section-heading"><h1>Feeds</h1></div>
        <Suspense fallback={<p className="loading-state" role="status">Gathering the latest stories…</p>}>
          <Journal {...props} />
        </Suspense>
      </section>
    </main>
  );
}

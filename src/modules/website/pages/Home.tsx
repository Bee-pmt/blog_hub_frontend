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
  for (const key of ["q", "category", "tag", "author", "page"] as const) {
    const value = params[key];
    if (typeof value === "string" && value.trim())
      filters[key] = value
        .trim()
        .slice(0, key === "author" ? 100 : key === "q" ? 200 : 500);
  }
  filters.page = /^[1-9]\d*$/.test(filters.page || "")
    ? String(Math.min(Number(filters.page), 1000000))
    : "1";
  let result: [BlogPage, Category[], Tag[]];
  try {
    const [blogs, taxonomy] = await Promise.all([
      getCachedBlogs({ ...filters, limit: 9 }),
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

      <PostList data={data} filters={filters} />
    </>
  );
}

export default function Home(props: ModulePageProps) {
  return (
    <main id="main-content" className="site-container">
      <section className="hero">
        <p className="eyebrow">
          <span className="status-dot" /> A home for curious minds
        </p>
        <h1>
          Good ideas.
          <br />
          Great stories.
        </h1>
        <div className="hero-bottom">
          <p className="hero-description">
            Explore fresh perspectives, everyday discoveries, and stories that
            stay with you. A little inspiration for your next chapter.
          </p>
          <Link className="button button-primary" href="/dashboard/posts/new">
            Write a story <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
      <section className="journal-section" id="journal">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The journal</p>
            <h2>Worth all of your time.</h2>
          </div>
          <p className="section-note">New voices. Fresh perspectives.</p>
        </div>
        <Suspense
          fallback={
            <p className="loading-state" role="status">
              Gathering the latest stories…
            </p>
          }
        >
          <Journal {...props} />
        </Suspense>
      </section>
      <section className="about-section" id="about">
        <p className="eyebrow">Why BlogHub</p>
        <div>
          <h2>
            Everyone has something
            <br className="desktop-break" /> worth sharing for.
          </h2>
          <p>
            This is a place to think out loud, tell your story, and discover
            another point of view. Read something new. Write something that
            matters to you.
          </p>
        </div>
      </section>
    </main>
  );
}

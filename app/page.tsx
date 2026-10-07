import { Suspense } from "react";
import Link from "next/link";
import {
  BlogPage,
  Category,
  Tag,
  Filters,
  request,
  queryString,
  errorMessage,
} from "@/lib/api";
import SearchFilters from "@/components/search-filters";
import PostList from "@/components/post-list";

async function Journal({ searchParams }: PageProps<"/">) {
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
    result = await Promise.all([
      request<BlogPage>(`/blogs${queryString({ ...filters, limit: 9 })}`),
      request<Category[]>("/categories"),
      request<Tag[]>("/tags"),
    ]);
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
        <Link href="/#journal">All stories</Link>
        {categories.map((item) => (
          <Link
            key={item.id}
            href={`/${queryString({ category: item.slug })}#journal`}
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

export default function Home(props: PageProps<"/">) {
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
            <h2>Worth a little of your time.</h2>
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
            <br className="desktop-break" /> worth sharing.
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

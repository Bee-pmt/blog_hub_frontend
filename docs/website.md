# Website module

Source: [`src/modules/website`](../src/modules/website). This module renders the public reading experience. It reuses story and taxonomy code from other modules rather than defining another API service.

## Routes and files

| Frontend route | File | Purpose |
| --- | --- | --- |
| `/` | `pages/Home.tsx` | Home page, category discovery, search/filter controls, and paginated public stories. |
| `/blogs/[slug]` | `pages/Article.tsx` | Published article with category, author, tags, cover image, and Markdown content. |

`manifest.ts` registers both routes and connects the article metadata function. The Next.js catch-all route resolves the manifest; these module files are not separate App Router entry points.

## Home page data flow

1. `Home` renders its static sections and a Suspense boundary around the async `Journal` section.
2. `Journal` reads `q`, `category`, `tag`, `author`, and `page` from the URL search parameters, trims/bounds their values, and normalizes the page number.
3. It loads `getCachedBlogs({ ...filters, limit: 9 })` and `getCachedTaxonomy()` in parallel.
4. Those functions use the blogs/taxonomy API helpers, which call `apiWrapper` and then NestJS.
5. Categories become discovery links; `SearchFilters` receives the current filters and taxonomy; `PostList` renders the result and pagination.

For example, `/?q=travel&category=life&page=2#journal` requests the second page of matching public stories. Search submissions update the URL, which causes the server section to fetch/render the corresponding result. Voice input feeds this same search submission path.

The home page does not put public results into RTK Query or an auth slice. It uses Next.js public caching.

## Article data flow

`Article.tsx` reads the slug and calls `getCachedBlog(slug)`. A React `cache` wrapper lets the page and its metadata generation share the same lookup during rendering. Metadata includes the title, a short content-derived description, and article information.

A backend 404 invokes Next.js `notFound()`. Other fetch failures show a retry link. The article reuses `Markdown` and `BlogImage` from the blogs module. Category/tag/author links lead back to filtered home results.

## Backend and caching

| Backend request | Used for |
| --- | --- |
| `GET /blogs` | Public filtered/paginated results; home requests nine stories per page. |
| `GET /blogs/:slug` | One public article and its metadata. |
| `GET /categories` | Category discovery and filters. |
| `GET /tags` | Tag filters. |

The blogs and taxonomy cache functions use `stale: 0`, `revalidate: 60`, and `expire: 120`, with `blogs` and `taxonomy` cache tags respectively. Successful content writes through the frontend Server Action expire the relevant tags. Writes made elsewhere do not pass through that action; normal cache lifetime rules still apply.

Do not pass an application access token or private dashboard response into these public cache functions.

## Manual checks

- Browse the home page without signing in.
- Search by text, category, tag, and author; navigate to the next result page.
- Open a story and verify its cover, Markdown, metadata, and filter links.
- Try a missing slug and a backend outage to check the different error states.
- Publish or moderate a story from the dashboard, then check the public result after cache invalidation.

Related: [Stories](blog.md), [Taxonomy](taxonomy.md), [Base UI and voice input](base.md).

# Website module

Source: [`src/modules/website`](../src/modules/website). This module renders the public reading experience. It reuses story and taxonomy code from other modules rather than defining another API service.

## Routes and files

| Frontend route | File | Purpose |
| --- | --- | --- |
| `/` | `pages/Home.tsx` | Home page, category discovery, search/filter controls, and the scrolling public story feed. |
| `/blogs/[slug]` | `pages/Article.tsx` | Published article with category, author, tags, cover image, and Markdown content. |

`manifest.ts` registers both routes and connects the article metadata function. The Next.js catch-all route resolves the manifest; these module files are not separate App Router entry points.

## Home page data flow

1. `Home` renders the Feeds heading and a Suspense boundary around `Journal`.
2. `Journal` reads and bounds `q`, `category`, `tag`, and `author` from the URL.
3. It loads `getCachedBlogs({ ...filters, page: 1, limit: 9 })` and
   `getCachedTaxonomy()` in parallel. Public Next.js caching still serves this
   first page; no access token enters those cache functions.
4. `PostList` seeds the existing RTK Query store with the server's first page,
   without fetching it again. A previously cached feed is reused instead.
5. `getFeed` in `blogApi.ts` uses RTK Query's infinite-query support. Near the
   bottom, IntersectionObserver fetches the next public page. A Load more stories
   button supports keyboard users and browsers without IntersectionObserver.
   Failures preserve loaded cards and offer manual retry.
6. Search/filter changes update the URL and start a separate feed. Cards are
   deduplicated by UUID. Blog mutations invalidate/refetch every loaded page so
   deleting or unpublishing a story does not leave pagination offsets stale.

For example, `/?q=travel&category=life#journal` starts at the first matching page
and appends further pages as the reader scrolls. There are no numbered page links.
Voice search continues to use the same URL-based search submission.

## Feed controls and writing

Cards use light gray surfaces with dark-theme equivalents,
initial avatars, the existing single cover image, and Like/Dislike/Comment actions.
Comment opens the existing article's comments section. Only the signed-in author
sees the two-dot menu: Edit opens the existing editor route; Delete confirms before
removing; Unpublish returns the story to drafts. NestJS still checks ownership.

The bottom Write blog bar opens the existing `PostEditor` in a full-screen panel
that slides upward from the bottom without scrolling the feed. Its bundle is loaded on
demand. Visitors sign in first and return via `/?write=1#feed-editor`.

The editor's optional `onSaved` callback keeps draft saves in the feed rather than
navigating to a dashboard route. Publishing closes the editor panel and refreshes
the feed. Back to feed uses the existing unsaved-leave confirmation and recovery
copy. Drafts remain available through the existing My stories dashboard. The
original dashboard editor's navigation and behavior are unchanged.

The hero and About landing sections were removed. No friend/popularity filters,
sharing, extra media fields, or backend features were added.

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
- Search by text, category, tag, and author; scroll to load more matching stories.
- Open a story and verify its cover, Markdown, metadata, and filter links.
- Try a missing slug and a backend outage to check the different error states.
- Publish or moderate a story from the dashboard, then check the public result after cache invalidation.

Related: [Stories](blog.md), [Taxonomy](taxonomy.md), [Base UI and voice input](base.md).

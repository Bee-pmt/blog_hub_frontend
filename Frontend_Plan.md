# BlogHub Frontend — First Release

Status: Stages 1–11 implemented. Stage 12 automated verification and local setup documentation implemented; live-backend review remains pending because the API is offline. The user authorized implementation of all remaining stages together, including shared Header and Footer components.

## Summary

Build a complete frontend for readers, authors, and admins using the existing Next.js application and backend APIs.

Confirmed direction: **English interface, monochrome editorial design, light/dark themes, rich text editing, images by URL, and explicit saving with browser recovery.**

## Pages and User Experience

| Area | Pages and behavior |
|---|---|
| Homepage `/` | Brief introduction, category discovery links, latest published posts, search, filters, and pagination |
| Article `/blogs/[slug]` | Cover image, title, author, category/tags, publication date, and readable article content |
| Account `/login`, `/register` | Email/password login; registration followed by login; logout through the account menu |
| Author `/dashboard` | Own posts with All, Draft, and Published tabs; edit, publish/unpublish, and delete actions |
| Editor `/dashboard/posts/new`, `/dashboard/posts/[id]/edit` | Rich text editor, metadata fields, preview, explicit save/publish actions, and recovery |
| Taxonomy `/dashboard/taxonomy` | Category/tag lists, creation, and permitted renaming; admin-only deletion |
| Admin `/dashboard/admin/posts` | All authors’ posts with status filtering and moderation |
| Admin editor `/dashboard/admin/posts/[id]/edit` | Edit, publish/unpublish, or delete any post |

- Search uses `q`, category slug, tag slug, and partial author name. Keep filters and page in the URL so searches are shareable and browser navigation works.
- Category selection narrows available tags; changing category clears the selected tag and resets pagination.
- Author names link to the author-name search, matching the backend’s partial-name behavior.
- Post cards show title, excerpt as plain text, author, category, date, and optional cover. No fabricated featured posts, popularity rankings, or statistics.
- Use a shared dashboard sidebar on desktop and compact navigation on mobile. Show admin sections only to admins.
- Use a BlogHub text wordmark, black/white/gray surfaces, serif article typography, and the existing Geist fonts for controls. Theme defaults to the system preference, with a remembered override.
- Include keyboard navigation, visible focus, labeled forms, accessible confirmations, loading states, empty states, retry actions, and missing-post pages.

## Writing and Management

- Use Tiptap with its Markdown extension, supporting headings, bold/italic, lists, quotes, links, inline/fenced code, horizontal rules, URL images with alt text, and undo/redo. Add **Visual, Markdown source, and Preview** modes. Tiptap provides bidirectional Markdown support, currently marked beta. [Official documentation](https://tiptap.dev/docs/editor/markdown)
- Preserve original Markdown until content is edited. Unsupported existing formatting opens in source mode rather than silently losing content during visual conversion. Tables, embeds, and advanced layout formatting are outside the visual toolbar.
- Save Markdown to the existing `content` field. Use one safe Markdown renderer for article pages and preview, with raw HTML disabled and HTTP(S)-only images.
- Editor fields: title, content, required category for new posts, up to 10 tags from that category, and optional cover URL. Match backend validation limits.
- New posts offer **Save draft** and **Publish**. Existing drafts offer **Save draft** and **Publish**; published posts offer **Save changes** and **Unpublish**.
- Debounce browser recovery copies by one second, scoped to account and post. Offer Restore or Discard after interruption; clear recovery after successful saving or logout. Warn before leaving with unsaved changes.
- Failed saves retain the editor content. Disable duplicate submissions; do not automatically retry post mutations.
- Authors can rename only taxonomy they created and cannot delete taxonomy. Admin category deletion explains that child tags are deleted and affected posts become Uncategorized.
- Existing Uncategorized posts remain editable without forcing reassignment; adding tags requires selecting a category.

## Integration and Implementation

- Keep the current Next.js, React, TypeScript, and Tailwind stack. Follow bundled Next.js guides and retain Cache Components.
- Public data uses Server Components with Suspense around uncached reads; interactive filters, authentication, dashboards, and the editor use Client Components.
- Create typed frontend interfaces for account profiles, taxonomy, blog summaries/details, pagination, and mutation payloads matching existing DTOs. **No backend API or schema changes.**
- Configure browser requests through `NEXT_PUBLIC_API_BASE_URL`, defaulting locally to `http://localhost:5300/api/v1`.
- Use a shared fetch client and React authentication context. Keep access tokens in memory; use credentialed login/refresh/logout and Bearer headers for protected requests.
- Restore sessions through one shared refresh operation followed by `/auth/me`. Use the returned `expiresIn`, avoiding the documented token-duration mismatch. Serialize refreshes within a tab and coordinate across tabs using Web Locks where available.
- Retry a protected request once after a successful refresh; refresh failure returns the user to login while preserving unsaved writing. Keep auth-dependent UI in a loading state until session restoration finishes.
- Render externally supplied images directly in the browser with lazy loading and broken-image fallbacks; do not proxy arbitrary image URLs through the Next.js image optimizer.
- The roadmap below records the implementation order. The latest user instruction authorized completing all stages together.

## Verification and Defaults

- Run frontend lint, TypeScript checks, and production build.
- Add focused Vitest checks for query construction, errors/204 responses, refresh concurrency, safe Markdown rendering, and editor Markdown round trips.
- Add Playwright flows with mocked API responses for browsing/filtering, registration/login/reload/logout, draft creation and publishing, recovery after failed saves, ownership restrictions, and admin moderation.
- Verify mobile/desktop layouts, both themes, keyboard use, malicious Markdown/URLs, deleted categories, expired sessions, and empty/error states.
- Complete a manual integration check against the local backend using disposable test content; do not seed admins or run database reset scripts automatically.
- First release excludes uploads, comments, likes, password recovery, profile editing, user management, and deployment. Assume compatible same-site frontend/backend origins and the existing CORS configuration.

## Step-by-Step Implementation Roadmap

### Working agreement

- The user initially requested individual stage reviews, then explicitly authorized implementing all stages together.
- Stages 1–11 are implemented. Stage 12 covers automated checks and setup documentation; the live-backend portion awaits a running API.
- Report implementation results and remaining verification limits for user review.
- Each stage must leave the application usable. Add dependencies only when that stage needs them, and keep backend code and database schema unchanged.
- Run lint and TypeScript checks for each stage; run the production build for changes affecting routing or rendering. Add focused behavioral tests with the stage that introduces the behavior, rather than postponing all tests to the final stage.

### Stage 1 — Design foundation and site shell

Deliver the BlogHub text wordmark, monochrome design tokens, article/control typography, responsive header/footer, reusable form/button/card styles, and light/dark theme switching with remembered preference. Replace the starter page with a minimal BlogHub shell; do not invent posts or implement the feed yet.

Checkpoint: review the visual direction, spacing, mobile navigation, keyboard focus, and both themes before building feature pages.

Stage 1 review notes: the site shell, responsive layout, shared control styles, and System/Light/Dark appearance selector are implemented. Geist fonts are bundled locally with their license to avoid build-time font downloads. Lint, TypeScript, whitespace checks, and direct Tailwind compilation pass. The development page was reviewed in the browser, including theme selection, persistence on a new page load, and a 390px layout without horizontal overflow. Production build verification remains blocked by this execution environment denying the port binding required by Turbopack's CSS worker, including after an escalated retry. Subsequent stages are now implemented as authorized.

### Stage 2 — Typed API foundation

Add the configurable API base URL, types matching backend responses and payloads, and shared request/error handling. Support JSON responses, validation-message arrays, network failures, and successful 204 responses. Add public blog/category/tag read functions; defer authentication and protected requests to Stage 6.

Checkpoint: public reads work against the backend; focused tests cover query encoding, HTTP errors, and bodyless responses. No credentials or secrets are exposed.

### Stage 3 — Homepage and latest-post feed

Build the brief introduction, category discovery area, real published-post cards, and numbered pagination using backend data. Cards include a plain-text excerpt and optional cover-image fallback. Add loading, empty, and error/retry states, using Suspense for uncached public reads.

Checkpoint: the homepage displays real published posts, pagination works, and unavailable data does not break the site shell. Category/search navigation is completed in Stage 5.

### Stage 4 — Article reading page

Build the slug-based article route with metadata, author, category/tags, dates, cover image, and safe Markdown rendering. Support readable headings, lists, quotes, code, links, and inline images. Disable raw HTML, reject unsafe URLs, and provide missing-post and failed-load states. Reuse this renderer later for editor previews.

Checkpoint: existing Markdown posts render correctly on mobile and desktop; unsafe content cannot execute; missing or unpublished posts show the appropriate unavailable page.

### Stage 5 — Search and discovery

Add text search, category/tag filters, partial author-name filtering, reset controls, and URL-backed state. Wire category/tag/author links from cards and article pages into the homepage filters. Load tags for the selected category; clear the tag when category changes and reset the page whenever a filter changes. Submit text filters explicitly to avoid issuing a request for each keystroke.

Checkpoint: combined filters match the backend, pagination retains filters, copied URLs reproduce results, and browser Back/Forward restores the search state.

### Stage 6 — Authentication and session handling

Build registration and login pages, logout, account navigation, and the authentication context. Registration leads to login. Add credentialed cookie operations, in-memory access tokens, session restoration through refresh and `/auth/me`, serialized refresh, role-aware navigation, and protected-request handling. Use a shared refresh promise within a tab and Web Locks across tabs where available. Redirect successful login to a validated local return path or `/dashboard`; never accept an external return URL.

Checkpoint: registration, login, page reload, expiry/refresh, and logout work; concurrent refresh does not reuse a token; protected UI waits for session restoration. Authentication failures remain distinct from network/server failures.

### Stage 7 — Author dashboard

Build the responsive dashboard layout and own-post list with All, Draft, and Published tabs, pagination, and loading/empty/error states. Show title, status, category, and dates. Add read-only account information from `/auth/me`. Defer editor links and mutation controls until their destination/action is implemented; show admin destinations when Stage 11 exists.

Checkpoint: signed-in users see only their own posts, status tabs and pagination work, and unauthenticated visitors return to login with their intended destination preserved.

### Stage 8 — Author category and tag management

Build taxonomy lists, category creation, tag creation under an existing category, and renaming of owned entries. Show creator-based edit permissions, duplicate-name errors, and updated slugs after renaming. Authors have no taxonomy delete control. Defer admin-wide editing and deletion controls to Stage 11.

Checkpoint: an author can prepare categories/tags for writing, rename their own entries, and receives useful validation/conflict messages without access to another author's editing actions.

### Stage 9 — Rich text editor and draft creation

Add the new-post editor with Visual, Markdown source, and Preview modes, the agreed formatting toolbar, URL images with alt text, title/category/tag/cover fields, and Save draft. Use Tiptap's Markdown conversion and the Stage 4 renderer. Validate against backend limits and clear selected tags on a category change. Add duplicate-submission protection, account-scoped browser recovery, Restore/Discard, and unsaved-change warnings now. After a successful first save, open the returned post's edit route and load its draft for continued saving; broader existing-post lifecycle actions arrive in Stage 10.

Checkpoint: a newly written post saves as a private draft, reopens without losing supported formatting, respects category/tag rules, and survives interrupted writing or failed saves. Test Markdown round trips before accepting the editor.

### Stage 10 — Existing posts and publication lifecycle

Wire dashboard editing to `/me/blogs/:id`. Preserve original Markdown until edited and use source mode for unsupported formatting. Add Save changes, Publish, Unpublish, preview, and permanent post deletion with confirmation. Handle existing Uncategorized posts, first publication dates, stable slugs, and failures without discarding writing. Refresh affected lists after successful mutations; public reads remain fresh.

Checkpoint: an author can create, edit, publish, unpublish, and delete their own post. Public visibility follows status, and saving preserves supported content and stable URLs.

### Stage 11 — Admin workspace

Add the all-posts admin list, status filtering/pagination, and admin edit route using `/admin/blogs/:id`. Reuse the editor and publication actions with admin permissions. Extend taxonomy management so admins can rename any entry and delete categories/tags. Category deletion explicitly describes child-tag removal and preservation of posts as Uncategorized.

Checkpoint: admins can moderate another author's posts and taxonomy; authors cannot access admin views; category deletion consequences are accurately communicated and reflected after reloading data.

### Stage 12 — Full integration and release review

Complete end-to-end coverage across the finished features, check the actual backend integration using disposable content, and review both themes, narrow/wide screens, accessibility, and loading/error/empty states. Run lint, TypeScript checks, focused tests, browser tests, and the production build. Document local frontend/backend startup and environment configuration. Fix only issues within the agreed first-release scope.

Checkpoint: all agreed reader, author, and admin flows pass, known limitations are documented, and the frontend is ready for local use. Deployment remains a separate task.


## Implementation review — October 7, 2026

The frontend now includes shared Header/Footer components, the live-data public journal, combined URL filters and pagination, safe Markdown articles, registration/login/logout, cookie session restoration, author/admin post management, category/tag permissions, and the full editor/publication lifecycle. The editor includes URL images, Visual/Source/Preview modes, original Markdown preservation, explicit saves, local recovery, and navigation warnings.

Public reads remain Server Components inside Suspense. Authentication and workspace interactions run in client components against the existing backend. Next.js Cache Components stays enabled; dashboard segments explicitly allow session-dependent navigation. Tailwind uses standard PostCSS for both bundlers. No backend files, database schema, seed scripts, or real application data were changed by this implementation.

Verification passed: lint, TypeScript, all 13 focused Vitest checks, the production Webpack build, and all nine Playwright flows against an isolated in-memory API. Desktop journal/editor and 390px dark-theme screenshots were also reviewed. Browser checks cover URL filtering, article safety, registration/login/reload/logout, draft creation and publication, failed-save recovery, author/admin permissions, category deletion consequences, mobile/dark appearance, access expiry, metadata edits preserving untouched Markdown, and confirmed post deletion. Test API content is only a fixture, never a fallback in the actual app.

Remaining release review: the actual API at localhost:5300 was offline, so real database-backed integration was not performed. The default Turbopack build was blocked by this environment denying its CSS worker's local port binding, including an escalated retry; the supported Webpack production build passes. README.md contains setup, test commands, cookie/origin requirements, and the manual integration checklist. The existing Next.js ESLint dependency chain has five high audit advisories; no force downgrade was applied.

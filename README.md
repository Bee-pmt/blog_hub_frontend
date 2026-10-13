# BlogHub frontend

Next.js App Router frontend for the existing BlogHub NestJS API. Includes the public journal, URL-backed discovery, safe Markdown articles, registration/login, author and admin workspaces, taxonomy management, and a rich text editor with browser recovery. Header and Footer markup lives in the root layout. Follow `Rule.md` and the installed Next.js guides before extending it.

See [Frontend architecture](docs/architecture.md) for the folder structure, routes, component responsibilities, authentication, data flows, and image upload behavior.

## Local startup

Use Node.js 20.19+ or a compatible newer LTS release.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The default public API URL is `http://localhost:5300/api/v1`. Set `NEXT_PUBLIC_API_BASE_URL` in `.env.local` when needed, then restart Next.js. This value is compiled into browser code; never put a secret in it.

In the sibling backend repository, configure its database and authentication environment and run `npm run start:dev`. Its current TypeORM configuration uses PostgreSQL port **5433**. The backend requires `JWT_SECRET` of at least 32 bytes. `FRONTEND_ORIGINS` defaults to `http://localhost:3000`; alternate frontend origins must be explicitly included. Swagger is at http://localhost:5300/api/docs. Production cookies require HTTPS.

Sign-in and registration forms call Server Actions in `actions/auth.ts`. Next.js stores the backend refresh token in a frontend HttpOnly cookie and forwards it for server-side refresh and sign-out. The access token stays in browser memory for authenticated API calls. The Next.js server must be able to reach `NEXT_PUBLIC_API_BASE_URL`. Existing sessions created before this change may require signing in again.

The backend uses schema synchronization. No backend startup, seeding, reset, admin creation, or schema change is performed by this frontend. Use an existing admin account for admin views; public registration creates authors.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

If this execution environment blocks Turbopack's CSS worker from binding a port, use the supported alternative `npm run build -- --webpack`. Both bundlers use the same Tailwind PostCSS configuration. Start a completed build with `npm run start`.

Browser tests use an isolated in-memory API on port 5301 and a **production** frontend on port 3001. They never touch the real backend or database. Build output is separate (`.next-test`), and test servers stop when the suite ends.

```bash
npx playwright install chromium
npm run test:e2e
```

An installed Chrome binary can be used instead:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome npm run test:e2e
```

## Behavior and limits

- Access tokens stay in memory. Cookie operations include credentials; authenticated requests use Bearer headers. Refreshes share one promise per tab and use Web Locks across tabs where available. BroadcastChannel synchronizes account changes across tabs.
- New posts require a category. Existing Uncategorized posts can be saved without assignment. Category changes clear selected tags, and at most 10 tags can be selected.
- Save draft, Publish, Save changes, Unpublish, and confirmed permanent deletion use the existing API. Failed mutations keep writing and are never retried after a network error.
- Visual, Markdown source, and Preview share the same content. The original source remains untouched until an actual edit. Tables, raw HTML, task lists, reference links, footnotes, and other detected advanced formatting stay in source mode. Raw HTML is omitted from the article and preview renderer. Inline Markdown images use URLs.
- Cover images can be selected from the device (JPEG, PNG, or WebP, maximum 5 MB), previewed, replaced, or removed. They upload with the blog's save/publish request. Returned `/images/...` paths load from the backend origin. Selected files stay in memory and must be reselected after a reload; browser recovery preserves the writing and saved cover reference.
- Browser recovery is local to an account and post, updated after one second and before saving or closing the page. Restore/Discard offers a recovery decision; successful saving and explicit logout clear copies. Recovery is not a server autosave and can be unavailable when browser storage is blocked. Write on a trusted browser and save explicitly.
- Unsaved changes warn on in-app links, sign-out, reload/close, and history navigation in browsers supporting the Navigation API. Older browsers still offer recovery and close/reload warnings.
- Authors can rename only taxonomy they created. Admins can moderate any post and delete taxonomy; deleting a category removes its tags and preserves affected stories as Uncategorized.
- All stories uses the admin status endpoint to publish or unpublish any story. Admin unpublishing blocks owner publication until an admin publishes it again. Owners can continue editing and saving the draft; their publication controls show the restriction.
- Comments, likes, profile editing, and deployment are not included.

## Live integration review

The real backend was offline during implementation. After starting it, use disposable accounts/content to check registration, login/reload/refresh/logout, taxonomy creation, draft saving/recovery, publication/unpublication, stable slugs, and ownership. With an existing admin, verify moderation and category deletion consequences. Clean up only the disposable content you created.

The dependency audit reports five high advisories in the existing Next.js ESLint toolchain (`braces` and its parent packages). These are development dependencies; no automatic force downgrade was applied. Recheck upstream fixes before a release.

## Password management

After signing in, the settings icon beside the account name in the workspace sidebar opens `/settings` to change the password. The form checks confirmation and password length, then uses the backend's `/auth/change-password` endpoint. Successful changes clear the frontend session and return to sign-in; other tabs sign out too.

The sign-in page links to `/forgot-password`. Enter the registered email, then its six-digit verification code and a new password. Codes expire after 15 minutes; resending has a 60-second cooldown. Recovery uses the existing `/auth/forgot-password` and `/auth/reset-password` endpoints. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in the backend's local `.env` and restart the backend to send real mail. See the backend's `docs/FORGOT_PASSWORD.md` for details. Browser tests use mocked email codes and never send real mail.

## Admin user management

Admins can open **Users · Admin** in the workspace sidebar (`/dashboard/admin/users`). Search by name or email; results show account name/email, registration date, role, and status, with 10 users per page and Previous/Next controls. Role and account-access changes require confirmation. Deactivation preserves stories and revokes sessions; reactivation requires a fresh login. The backend prevents self-deactivation and removing the last active admin, including concurrent requests. User creation and deletion are not included. Restart the backend to load the new role endpoint.

## Content caching

Zustand continues to manage authentication. Public story lists and articles use exported functions in `lib/content-cache.ts`; categories and tags share a cached taxonomy function, also available to workspace components through `getTaxonomyAction`. Next.js caches results by function arguments, so filters and pagination remain independent.

Blog saves, uploads, publishing, moderation, deletion, and taxonomy changes go through `actions/content.ts` with the current access token. The backend still verifies permissions. Successful writes immediately expire the relevant cache tags. Private drafts and dashboard blog lists are never placed in the shared Next.js server cache. They are reused in the account-scoped Zustand store; account information and user management continue to load through authentication. Public entries revalidate after 60 seconds and expire after 120 seconds as a fallback for changes made directly to the backend. Already open pages need navigation or refresh to show changes. No new dependency is required.

### Simple API usage

`lib/api.ts` uses `apiRequest(route, method, options)`. The method defaults to `GET`; options are only needed for a body or headers:

```ts
const categories = await apiRequest<Category[]>("/categories");
await apiRequest("/blogs/story-id", "DELETE");
await apiRequest("/auth/register", "POST", {
  body: JSON.stringify({ displayName, email, password }),
});
```

Prefer the exported feature functions in components. Server pages use `getCachedBlogs`, `getCachedBlog`, and `getCachedTaxonomy` from `lib/content-cache.ts` to reuse Next.js cached results. Private reads receive the Zustand authenticated `api` sender. Content writes explicitly receive `contentApi`, which uses a Server Action. Both use the same route/method/options format. Error handling, refresh cookies, and file uploads are preserved.

## Zustand content stores

The dashboard shares blog data through `features/blogs/blog-store.ts` and category/tag data through `features/taxonomy/taxonomy-store.ts`. `AuthProvider` creates one instance of each per app tree, alongside authentication. These stores keep loaded data and fetch/write actions in one place. List and taxonomy loading/errors live in the stores; the editor owns its detail loading/error state.

This avoids fetching the same fresh data whenever a component mounts. For example, **Categories & tags** and **Write a story** reuse the same category/tag arrays. **My stories** can reuse its list when you return from the editor. Requests started at the same time share one promise. A saved blog's returned detail is reused when reopening the editor.

Blog lists are separated by author/admin view, status, and page. Data is fresh for 60 seconds and is fetched again on the next load after that. Successful blog changes invalidate the affected author/admin status lists and that blog’s old detail. Unrelated details and status lists are retained. Category/tag edits and deletions reload taxonomy and invalidate cached blogs referencing the changed category or tag; creating taxonomy leaves existing blog caches intact. The public Next.js cache still expires through the existing Server Actions.

Stores live in browser memory. Reloading the page creates fresh stores. Logout, account changes, role changes, and session loss clear their data, and old requests cannot repopulate a cleared store. Form inputs, selected images, confirmation dialogs, and browser draft recovery keep their existing local behavior. Content changes in other tabs or by other users are picked up by a subsequent load after expiry or a page reload; there is no live update subscription.

```tsx
const categories = useTaxonomyStore((state) => state.categories);
const loadTaxonomy = useTaxonomyStore((state) => state.load);

useEffect(() => {
  void loadTaxonomy().catch(() => {}); // Fetch once; reuse while fresh.
}, [loadTaxonomy]);
```

The selector subscribes the component to the data it needs. Calling a store action updates every subscribed component automatically.

Browser recovery, storage access, and unsaved-change navigation warnings live in `features/blogs/use-draft-recovery.ts`. The editor calls its read/save/clear functions rather than duplicating browser storage logic. Components use focused Zustand selectors; grouped selections use `useShallow` to avoid updates from unrelated store fields.

## Frontend folder structure

- `app/`: Next.js routes and layouts. The small header/footer markup lives in the root layout.
- `features/auth/`: authentication forms, provider, and Zustand auth store.
- `features/blogs/`: story lists, editor, rendering, validation, recovery hook, and blog store.
- `features/taxonomy/`: category/tag management and store.
- `features/users/`: admin user management.
- `components/`: UI shared across features: dashboard shell, confirmation dialog, and theme switch.
- `actions/`: authentication and content Server Actions.
- `lib/`: shared API/session code and explicitly named public `content-cache.ts`.
- `types/models.ts`: shared models; component-only props stay beside their component.
- `tests/`: unit tests and browser tests.
- `docs/`: [current architecture](docs/architecture.md) and [archived first-release plan](docs/archive/frontend-plan.md).

Feature folders contain their related files directly, without extra component/store subfolders or re-export files. Keep Next.js page files in `app/` and configuration files at the repository root.

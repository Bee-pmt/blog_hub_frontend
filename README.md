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

In the sibling backend repository, configure its database and authentication environment and run `npm run start:dev`. This laptop’s dedicated PostgreSQL instance uses port **5433**; the backend reads the port from its local `.env`. The backend requires `JWT_SECRET` of at least 32 bytes. `FRONTEND_ORIGINS` defaults to `http://localhost:3000`; alternate frontend origins must be explicitly included. Swagger is at http://localhost:5300/api/docs. Production cookies require HTTPS.

Sign-in and registration forms call Server Actions in `src/modules/auth/actions.ts`. Next.js stores the backend refresh token in a frontend HttpOnly cookie and forwards it for server-side refresh and sign-out. The access token stays in browser memory for authenticated API calls. The Next.js server must be able to reach `NEXT_PUBLIC_API_BASE_URL`. Existing sessions created before this change may require signing in again.

The backend owns database schema setup. Chat tables and message-deletion support require the registered backend migrations; see its chat setup documentation. No backend startup, seeding, reset, admin creation, or schema change is performed by this frontend. Use an existing admin account for admin views; public registration creates authors.

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

Run `npm audit` after dependency updates. The latest frontend audit resolved the reported development-tool advisories through targeted updates, without adding runtime dependencies or forcing a framework downgrade.

## Password management

After signing in, the settings icon beside the account name in the workspace sidebar opens `/settings` to change the password. The form checks confirmation and password length, then uses the backend's `/auth/change-password` endpoint. Successful changes clear the frontend session and return to sign-in; other tabs sign out too.

The sign-in page links to `/forgot-password`. Enter the registered email, then its six-digit verification code and a new password. Codes expire after 15 minutes; resending has a 60-second cooldown. Recovery uses the existing `/auth/forgot-password` and `/auth/reset-password` endpoints. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in the backend's local `.env` and restart the backend to send real mail. See the backend's `docs/FORGOT_PASSWORD.md` for details. Browser tests use mocked email codes and never send real mail.

## Admin user management

Admins can open **Users · Admin** in the workspace sidebar (`/dashboard/admin/users`). Search by name or email; results show account name/email, registration date, role, and status, with 10 users per page and Previous/Next controls. Role and account-access changes require confirmation. Deactivation preserves stories and revokes sessions; reactivation requires a fresh login. The backend prevents self-deactivation and removing the last active admin, including concurrent requests. User creation and deletion are not included. Restart the backend to load the new role endpoint.

## Module architecture

Application code lives under `src/`, with feature modules in `src/modules/`. See [architecture](docs/architecture.md) for the complete layout and data flow.

Each module registers routes and sidebar links in `manifest.ts`. `src/lib/registry.ts` collects modules and `src/moduleRegistry.tsx` resolves them through the optional catch-all page in `src/app/[[...segments]]/page.tsx`. Existing BlogHub URLs and designs are preserved. Public pages remain server-rendered with Next.js caching.

Redux Toolkit replaces Zustand for account state. RTK Query services in each module's `store/services/` expose generated query and mutation hooks. They handle loading, errors, request sharing, resource invalidation, and dashboard caching. Account changes clear private caches. React Hook Form manages form values; shared UI lives in `src/modules/base/components/`.

Authentication cookies, refresh coordination, Server Actions, Markdown handling, uploads, and browser draft recovery retain their existing behavior. Blog/taxonomy mutations still invalidate the Next.js public caches after the backend accepts a write.

```tsx
const { data, isLoading, error } = useGetManagedBlogsQuery({
  admin: false, status: "", page: 1,
});
const [deleteBlog] = useDeleteBlogMutation();
await deleteBlog(id).unwrap();
```

There is one source copy. Backend adapters for additional providers and demo tenant permissions are not part of BlogHub.

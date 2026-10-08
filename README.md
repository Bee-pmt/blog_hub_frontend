# BlogHub frontend

Next.js App Router frontend for the existing BlogHub NestJS API. Includes the public journal, URL-backed discovery, safe Markdown articles, registration/login, author and admin workspaces, taxonomy management, and a rich text editor with browser recovery. Header and Footer are shared components. Follow `Rule.md` and the installed Next.js guides before extending it.

See [Frontend architecture](architecture.md) for the folder structure, routes, component responsibilities, authentication, data flows, and image upload behavior.

## Local startup

Use Node.js 20.19+ or a compatible newer LTS release.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The default public API URL is `http://localhost:5300/api/v1`. Set `NEXT_PUBLIC_API_BASE_URL` in `.env.local` when needed, then restart Next.js. This value is compiled into browser code; never put a secret in it.

In the sibling backend repository, configure its database and authentication environment and run `npm run start:dev`. Its current TypeORM configuration uses PostgreSQL port **5433**. The backend requires `JWT_SECRET` of at least 32 bytes. `FRONTEND_ORIGINS` defaults to `http://localhost:3000`; alternate frontend origins must be explicitly included. Swagger is at http://localhost:5300/api/docs. Production cookies require HTTPS.

Sign-in and registration forms call Server Actions in `action/action.ts`. Next.js stores the backend refresh token in a frontend HttpOnly cookie and forwards it for server-side refresh and sign-out. The access token stays in browser memory for authenticated API calls. The Next.js server must be able to reach `NEXT_PUBLIC_API_BASE_URL`. Existing sessions created before this change may require signing in again.

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
- Comments, likes, password reset, profile editing, user administration, and deployment are not included.

## Live integration review

The real backend was offline during implementation. After starting it, use disposable accounts/content to check registration, login/reload/refresh/logout, taxonomy creation, draft saving/recovery, publication/unpublication, stable slugs, and ownership. With an existing admin, verify moderation and category deletion consequences. Clean up only the disposable content you created.

The dependency audit reports five high advisories in the existing Next.js ESLint toolchain (`braces` and its parent packages). These are development dependencies; no automatic force downgrade was applied. Recheck upstream fixes before a release.

# BlogHub frontend architecture

BlogHub uses a module architecture inspired by Zolotaya, with one source tree under `src/`. The NestJS backend and existing URLs remain unchanged.

## Structure

```text
src/
├── app/
│   ├── [[...segments]]/page.tsx
│   ├── layout.tsx
│   ├── error.tsx
│   ├── not-found.tsx
│   ├── globals.css
│   └── fonts/
├── modules/
│   ├── auth/
│   ├── blogs/
│   ├── taxonomy/
│   ├── users/
│   ├── website/
│   └── base/
├── lib/
│   ├── registry.ts
│   ├── ReduxProvider.tsx
│   ├── store/
│   ├── api/baseApi.ts
│   ├── api-client.ts
│   ├── content-client.ts
│   ├── session.ts
│   └── utils.ts
├── actions/content.ts
├── moduleRegistry.tsx
└── moduleTypes.ts
```

Each module has a `manifest.ts` that registers pages and navigation. Modules own their `pages/`, `components/`, types, and API logic as needed. Blogs, taxonomy, and users define RTK Query endpoints in `store/services/`. Authentication owns its Redux slice and thunks in `store/slices/`, and its `useAuth` hook in `hooks/`. Shared models live in each owning module’s `types/index.ts`; draft recovery lives in `blogs/hooks/`. Base owns reusable UI, including `TextField`, the confirmation dialog, workspace shell, and theme switch. Website owns public journal and article pages.

There are no duplicate root `app/`, `modules/`, or `lib/` folders. The `@/` alias resolves only to `src/`. Tests and documentation stay at the repository root.

## Manifest routing

The optional catch-all Next.js page supports the homepage and all module URLs. `lib/registry.ts` collects manifests; `moduleRegistry.tsx` matches exact paths first, then equal-length paths with named parameters such as `[id]`. Unknown routes use Next.js not-found handling.

The dispatcher supplies extracted parameters and URL search parameters to the selected page. Route titles and article metadata come from manifests. Protected workspace routes get `DashboardShell`; admin URLs retain their role check, and private pages have no-index metadata. Navigation links are collected from module manifests and filtered by account role. The backend still authorizes every protected request.

Unlike Zolotaya's browser-only page dispatcher, BlogHub resolves manifests on the server. This preserves public journal/article server rendering, search URLs, article metadata, and Next.js public caching. Screens needing forms or browser state remain Client Components. The Redux provider is inside Suspense because creating a Redux store uses random internal action identifiers during rendering.

## State and API requests

`ReduxProvider` creates one store per mounted application tree. Redux Toolkit manages account state and authentication actions. RTK Query manages dashboard blogs, taxonomy, and admin users; custom Zustand stores have been removed.

Examples:

```tsx
const { data, isLoading, error } = useGetManagedBlogsQuery({
  admin: false, status: "draft", page: 1,
});
const [changeStatus] = useChangeBlogStatusMutation();
await changeStatus({ id, status: "published", admin: false }).unwrap();
```

Feature services inject endpoints into one shared RTK Query API. This lets taxonomy mutations invalidate both taxonomy and embedded blog labels without a second cache coordinator. Successful writes invalidate resource tags; rejected writes retain cached data. Subscribed queries refetch after invalidation. Queries share concurrent requests, retain unused results for 60 seconds, and refetch on mounting when older than 60 seconds. Editor lazy queries reuse retained details during navigation; retry explicitly fetches again.

Authenticated reads and user-management writes use the browser's Bearer transport. Blog/taxonomy writes still go through the existing content Server Action so successful writes immediately invalidate public Next.js cache tags. Taxonomy reads use a Server Action backed by the public taxonomy cache.

Account ID or role changes, logout, and session loss reset the entire RTK Query cache. A late response cannot reinsert an old account's query after reset. The Redux account slice ignores outdated restoration responses by request ID. Cache state is kept in memory and not persisted.

## Public content caching

Public reads follow:

```text
Module page → blogs/cache.ts or taxonomy/cache.ts
            → feature API → lib/api-client.ts → NestJS backend
```

Only public data enters Next.js `use cache`. Entries have `blogs` and `taxonomy` tags and lifetimes of 60 seconds to revalidate and 120 seconds to expire. Dashboard drafts and account profiles never enter that shared cache. Successful content writes call `updateTag`. Changes made directly to the backend follow time-based refresh; already-open pages do not receive live updates.

## Authentication

The existing Server Actions copy the backend refresh cookie into a frontend HttpOnly cookie. Access tokens remain outside Redux in browser memory. Login, refresh, and logout retain Origin forwarding and refresh rotation. A shared promise deduplicates refreshes within a tab; Web Locks coordinate across tabs. BroadcastChannel synchronizes login/logout.

Redux authentication thunks wrap these existing operations. Incorrect current passwords keep the user signed in; a successful password change clears cookies, account state, private caches, and the account's recovery copies. Password reset uses the backend's emailed verification code. Failed backend logout retains the session so the user can retry.

## Forms and shared components

React Hook Form owns login/registration values, password fields, taxonomy forms, user search, and editor draft fields. Native required/type/length constraints remain in place, with existing domain validation before writes. Forms retain their original labels, classes, wording, and layout. Shared `TextField` accepts native input props and the registration props from React Hook Form.

PostEditor and TaxonomyManager remain whole components; this migration does not extract their sections into extra components. File selection, dialogs, editor modes, and recovery decisions remain local state. Tiptap still edits Markdown, and unsupported formatting stays in source mode.

## Draft recovery and uploads

The editor's recovery hook stores writing under `bloghub-recovery:<account>:<post-or-new>`, with restore/discard and server-version notices. Successful saves and explicit logout clear appropriate copies. Unsaved writing warns before supported navigation/reload/close. Recovery is local browser storage, not backend autosave.

JPEG/PNG/WebP covers up to 5 MB upload with story writes. Preview object URLs are revoked when replaced. Selected files stay outside Redux query state and must be reselected after reload. Stored backend `/images/...` paths resolve to the backend origin. Markdown rendering skips raw HTML and restricts URLs.

## Verification

- `npm run typecheck`: Next.js route generation and TypeScript.
- `npm run lint`: ESLint.
- `npm test`: transport, authentication, Redux, RTK Query, Markdown, validation, and cookie checks.
- `npm run test:e2e`: production browser flows against the isolated in-memory API on 5301 and frontend on 3001.

Browser tests do not connect to the real database or send mail. `BLOGHUB_TEST_BUILD=1` separates `.next-test` from local development output. Backend integration and deployment remain separate tasks.

# BlogHub frontend documentation

Start here to understand the current frontend. These guides describe the code in `src/modules`; they do not add new application behavior.

## Module guides

| Module folder | Guide | Responsibility |
| --- | --- | --- |
| `src/modules/auth` | [auth.md](auth.md) | Password and Google authentication, application session, password recovery |
| `src/modules/base` | [base.md](base.md) | Shared workspace, dialogs, fields, theme switch, reusable voice input |
| `src/modules/blogs` | [blog.md](blog.md) | Story data, editing, publishing, moderation, activity history |
| `src/modules/chat` | [chat.md](chat.md) | Private conversations, message history, sockets, typing, read receipts |
| `src/modules/notifications` | [notifications.md](notifications.md) | Notification bell, list, unread counts, read actions |
| `src/modules/taxonomy` | [taxonomy.md](taxonomy.md) | Categories and tags used to organize stories |
| `src/modules/users` | [users.md](users.md) | Administrator user management and shared user types |
| `src/modules/website` | [website.md](website.md) | Public home page and article page |

See [architecture.md](architecture.md) for the broader implementation history and [google-login.md](google-login.md) for Google setup instructions. The module guides describe the current UI, including the chat close icon and removal of its manual Refresh button.

## How module routing works

The files under `src/modules/*/pages` are connected through manifests. Their folder names alone do not create Next.js routes.

1. Next.js receives the request in [`src/app/[[...segments]]/page.tsx`](../src/app/[[...segments]]/page.tsx).
2. [`src/moduleRegistry.tsx`](../src/moduleRegistry.tsx) resolves the URL against the registered manifests. Exact routes are checked before routes containing parameters such as `[id]`.
3. [`src/lib/registry.ts`](../src/lib/registry.ts) supplies the eight modules and their navigation entries.
4. The matching page receives its parameters. Routes with an `access` setting use `DashboardShell`; public routes do not.
5. The catch-all page also delegates metadata to the route when a metadata function exists.

The frontend guards improve navigation and presentation. NestJS must still enforce authentication, ownership, roles, and permissions on every protected operation.

## The three data paths

| Data | Path | Where it is kept |
| --- | --- | --- |
| Public stories and taxonomy | Server page → feature `cache.ts` → feature `api.ts` → `apiWrapper` → NestJS | Next.js public cache |
| Dashboard REST data | Component → generated RTK Query hook → shared `baseApi` → authenticated transport → NestJS | RTK Query cache in Redux |
| Application account | Auth form/hook → auth thunk → Server Action/session helper → NestJS | Redux account state; access token in module memory; refresh cookie is HttpOnly |

Blog/taxonomy writes pass through `contentRequest` and [`src/actions/content.ts`](../src/actions/content.ts) so successful writes can expire public cache tags. User management, notification read actions, and conversation creation use direct authenticated requests through the same `baseApi`. Chat live events use Socket.IO with the existing application access token.

[`src/lib/api-client.ts`](../src/lib/api-client.ts) owns `API_BASE`, `apiWrapper`, result/error handling, and request timeouts. It does not manage Redux state or cache data itself. `API_BASE` defaults to `http://localhost:5300/api/v1`; endpoint paths in these guides are relative to it unless explicitly identified as a frontend route or socket namespace.

[`src/lib/api/baseApi.ts`](../src/lib/api/baseApi.ts) defines the shared RTK Query service. Feature services inject endpoints into it rather than creating separate API stores. Unused entries are retained for 60 seconds, and the default mount/argument freshness threshold is 60 seconds; individual hooks can request different behavior. Account ID or role changes reset the RTK Query cache through [`src/lib/store/index.ts`](../src/lib/store/index.ts).

## Checks

Run commands from the frontend root:

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

Browser tests use an isolated mock REST backend and simulated socket events. Passing those tests does not prove that a particular local PostgreSQL database is migrated or that real Google credentials/network access are configured. The module guides include manual checks for those integrations.

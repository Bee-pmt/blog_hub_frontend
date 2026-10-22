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

`/dashboard/activity` shows the current user's blog audit history. Its list and detail queries live in the existing `blogs/store/services/blogApi.ts`. Story writes invalidate the `BlogAudit` list tag; immutable details are cached by audit-record ID. A native dialog shows old/new values or the retained deletion snapshot. Both authors and admins use the personal `/me/blog-audit-logs` endpoints; there is no admin-wide activity view. Audit content stays in the authenticated RTK Query cache, and raw changes render as text rather than HTML.

The dashboard sidebar includes a notification bell beside account settings. Clicking it opens `/dashboard/notifications` in the main workspace through the notifications manifest. The notification page keeps the Facebook-style rows, relative times, pagination, and read controls. The `notifications` feature injects its list and read mutations into the shared RTK Query API. The badge and page share cached list data and poll every 30 seconds; opening the page refreshes its list. Successful read operations invalidate notification pages and unread counts. These private requests use the existing authenticated browser transport, and account changes clear their cache. Hovering over a relative time shows the full timestamp. No extra Redux slice or backend changes are needed.

## Chat: step 1 — conversation list

`/dashboard/chat` is a protected workspace page, opened through the **Messages** sidebar link. This first step displays existing conversations only: the other user's name/initial, last-message preview and timestamp, unread count, and 20 conversations per page. Refresh and retry controls fetch updated results. Empty conversations show “No messages yet.” The backend does not return profile images, so the UI uses an initial instead.

The data flow is `chat/pages/page.tsx` → `useGetConversationsQuery(page)` → shared `baseApi` → `authenticatedRequest` → `apiWrapper` → NestJS `GET /api/v1/chat/conversations?page=1&limit=20`. The existing session helper attaches the access token and handles refresh/retry. RTK Query caches each page separately. Account changes and logout clear these private queries through the existing store listener. No new reducer, auth system, or API client is used.

The new chat files are `types/index.ts` (the backend response shapes), `store/services/chatApi.ts` (the single list query), `pages/page.tsx` (the list UI), and `manifest.ts` (route and sidebar registration). `lib/registry.ts` includes the manifest; `lib/api/baseApi.ts` registers the Conversation cache tag; `app/globals.css` styles the list. Unit tests cover routing, caching, and logout; browser tests and their mock API cover loading, privacy, pagination, refresh, safe text rendering, empty/error states, mobile layout, and guest redirects.

To test with the real backend, sign in and open **Messages**. This uses your actual conversations, not the browser-test fixtures. If there are none, an authenticated `POST /api/v1/chat/conversations` with `{ "recipientId": "<another registered user's UUID>" }` in Swagger/Postman creates or finds one; click **Refresh** to see it. Use the existing `/api/docs` login/Bearer setup. A conversation with no messages displays the empty preview. The backend's chat migration must already be applied: its chat entities disable automatic schema synchronization, so starting NestJS alone cannot create their tables. See the backend's `docs/CHAT.md` for migration instructions. This frontend step does not run migrations or change backend files.

Conversation creation UI, message sending, and Socket.IO remain separate steps. Opening the list or a conversation does not mark messages as read.

## Chat: step 2 — reading message history

Conversation rows are now buttons. `chat/pages/page.tsx` stores the selected conversation ID and renders `chat/components/message-history.tsx`, keyed by the signed-in user and conversation ID. This resets the displayed history when switching conversations or accounts. Desktop shows the list beside history; mobile shows history with a **Back to conversations** button.

`useGetMessagesQuery({ conversationId, page })` uses the same authenticated REST transport for `GET /chat/conversations/:id/messages?page=1&limit=20`. Each conversation/page has its own RTK Query cache entry. Opening history refreshes the latest page. The component keeps loaded pages, removes overlapping message IDs, and sorts by timestamp and ID into chronological order because the backend sends newest first. Messages render as plain text: the current user's bubbles are on the right, other messages on the left. No read receipt is emitted, so unread counts do not change just from opening history.

**Load older messages** loads the next numbered page and keeps the messages already displayed. Two refs track the scroll element and its pre-load position; a layout effect restores the same reading position after prepending messages. The initial load scrolls to the latest message; ordinary re-renders do not force the reader back down. Failure/retry states preserve already loaded history, while forbidden or missing-conversation errors hide cached messages.

To test with your backend, open **Messages** and click an existing conversation. Check the name, timestamps, incoming/outgoing bubbles, empty state, and **Load older messages** when there are more than 20 messages. Switch between conversations, reload the page and reopen a conversation, and test the mobile back button. The browser tests use a mock API; no application messages are created or changed by this frontend work. No message composer, sockets, typing, presence, or read-receipt feature is included yet.

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

## Shared API wrapper

`src/lib/api-client.ts` exports `apiWrapper<T>({ endpoint, method, body, headers, requiredAuth, ...options })`. `endpoint` is a full URL; `method` defaults to GET. Object bodies are serialized to JSON, existing JSON strings are preserved, and FormData uploads are sent without an automatic Content-Type header.

The result is a typed union:

- Success: `{ ok: true, status, data }`.
- HTTP/network failure: `{ ok: false, status, data: { error } }`.

The `ok` flag also distinguishes unreadable successful HTTP responses from usable data. Network failures use status 0. Required authentication is opt-in; `requiredAuth: true` checks that a Bearer header was supplied before fetching. The backend still validates the actual token and permissions. No Authorization header is generated for public requests.

```ts
const result = await apiWrapper<BlogPage>({
  endpoint: `${API_BASE}/blogs?page=1&limit=9`,
  method: "GET",
});
if (result.ok) {
  console.log(result.data.items);
} else {
  console.error(result.status, result.data.error);
}

await apiWrapper<{ message: string }>({
  endpoint: `${API_BASE}/auth/register`,
  method: "POST",
  body: { displayName, email, password },
});
```

The wrapper handles HTTP 204 without parsing JSON, uses a default 15-second timeout, accepts caller cancellation, reads NestJS validation messages and error strings, and calls `onResponse` for both successful and failed HTTP responses. Authentication actions use that callback to copy or clear refresh cookies. `allowEmpty` supports successful auth responses with no JSON body.

`unwrapApiResult(result)` is the bridge for higher-level functions that already expect returned data and thrown errors. It returns successful data or throws an ApiError with the original status/message. Public cache functions and authenticated transport use it, preserving article 404 handling, the single 401 refresh/retry, and RTK Query's existing error behavior. Content Server Actions inspect the result directly and invalidate public cache tags only after success.

Dashboard reads follow component → generated RTK Query hook → baseApi → authenticatedRequest → apiWrapper → NestJS backend. Writes follow mutation hook → contentRequest → content Server Action → apiWrapper → backend. Admin user writes use authenticatedRequest directly. Public pages use module cache functions → feature API → apiWrapper. Authentication uses its actions/API helpers → apiWrapper and cookie response callbacks.

Compared with the earlier positional interface, callers now pass one object and receive status plus data instead of data alone. Compared with Zolotaya's current implementation, BlogHub retains upload support, empty-response handling, timeout/cancellation, cookie callbacks, and richer backend errors. RTK Query still manages dashboard caching and Next.js still manages public caching; the wrapper does neither.

### Chat step 3 — sending a message

`src/modules/chat/components/message-composer.tsx` adds the form below the existing message history. Socket.IO is required because the NestJS backend accepts sends through `message:send`, not a REST POST endpoint. The only new runtime dependency is `socket.io-client`.

The flow is: type text → Send → obtain the existing application access token → authenticated `/chat` socket → `message:send` → NestJS saves the message → acknowledgement → display the saved outgoing bubble and refresh the conversation previews. The socket connects when the form mounts; obtaining the token reuses `withAccessToken`, including its existing refresh logic. Its URL uses the origin of `NEXT_PUBLIC_API_BASE_URL`, so the default is `http://localhost:5300/chat` (not `/api/v1/chat`). The existing backend allowed frontend origins must include the browser's origin.

The form prevents blank messages and messages longer than 2,000 Unicode characters. It waits for server confirmation before showing a bubble. Errors retain the draft. After a missing acknowledgement, sending the unchanged draft again reuses its `clientMessageId`, allowing the backend to return the original saved message without inserting a duplicate. Editing the draft starts a new intended message. There is no automatic message resend or offline send queue.

Connection state and a Reconnect button are shown. Manual reconnect refreshes the existing application session first, which also handles a socket disconnected after access-token expiry. Normal temporary transport failures use Socket.IO reconnection. Switching conversations, leaving the page, or signing out disconnects the form's socket, and a late acknowledgement cannot update the old conversation.

`message-history.tsx` combines confirmed sends with loaded history by server message ID and scrolls to the saved outgoing message. RTK Query still handles REST history and conversation lists; Socket.IO handles the send operation. Incoming live messages, typing indicators, read receipts, and creating a conversation from the UI remain separate steps. The recipient can currently reopen history to see a newly sent message.

To try this step against the real backend, first apply its existing chat migration, start both applications, and open an existing conversation under Messages. Send a short message and check that it appears and remains after reopening the conversation. Sign in as the recipient and open that conversation to read it. No backend code or application database changes were made by this frontend step.

Tests cover the authenticated socket handshake, confirmed sends, backend errors, missing-acknowledgement retries with the same ID, validation, reconnect, and cleanup. Browser tests simulate the Socket.IO wire protocol alongside the existing isolated REST fixtures; they do not use real accounts or the application database.

### Chat step 4 — receiving live messages

The existing socket in `message-composer.tsx` now listens for `message:new` and passes the message to `message-history.tsx`. No additional socket, component, custom hook, dependency, or backend change was added. React's `useEffectEvent` lets socket listeners use the latest callbacks without disconnecting whenever the form or history renders.

The flow is: another user sends → NestJS saves → recipient socket receives `message:new` → matching conversation gets an incoming bubble → RTK Query refreshes the conversation previews and unread counts. Events for other conversations refresh the list but are not inserted into the open conversation. Both REST history and live messages are combined by server message ID, so repeated events or later history fetches show one bubble. Incoming content remains plain text.

If the reader is near the bottom, the new message scrolls into view. If they are reading older messages, their scroll position stays in place. Sending a message still scrolls to the confirmed outgoing bubble.

Every socket connection/reconnection refreshes conversation summaries and restarts history from page 1. The `ChatMessage` RTK Query tag invalidates only the open conversation's history. Invalidation also waits for an already pending history request before refetching, so connecting during the initial read does not skip recovery. Older history can be loaded again with Load older messages; recovery does not fetch the entire conversation at once. Live messages received during recovery are retained and deduplicated with the fetched history.

The socket is active while a conversation is open on the Messages page. Closing the conversation, leaving the page, or signing out removes listeners and disconnects it. This step does not add a global background chat connection. Typing indicators and read receipts are still separate steps; viewing an incoming bubble does not mark it read yet.

To try it: use two browser profiles with different registered users, open the same existing conversation in both, and send in either direction. The recipient should see the new bubble without refreshing. Scroll up and send another message to check that reading position stays put. Disconnect one client, send from the other, then reconnect to recover the saved messages through REST history.

Automated checks use the isolated REST fixtures and simulated Socket.IO packets. They cover live incoming bubbles, duplicate events, plain text, conversation isolation, scroll behavior, reconnect recovery, pagination after recovery, and listener cleanup. No real application database or user accounts are changed.

### Remaining chat controls — read receipts, typing, keyboard, and starting a conversation

The existing chat files now also support these backend features:

- `message-composer.tsx` emits `typing:start` at most once every three seconds while typing, and `typing:stop` after 1.2 seconds of inactivity, on blur, after Send, or before disconnecting. Incoming typing events are restricted to the open conversation and expire after five seconds if the stop event is lost. Disconnecting and switching conversations clear them.
- Enter sends; Shift+Enter inserts a new line. Enter during IME composition is preserved.
- Incoming messages are acknowledged with `message:read` only when history has loaded, the reader is at the bottom, the document is visible, and the browser window has focus. The request is briefly batched. Only a successful backend acknowledgement updates the captured message IDs locally; later-arriving messages are handled separately. A failed read update has a retry button.
- Outgoing bubbles show Sent or Read using the backend's `isRead` field. A received read-receipt event refetches the loaded history pages before updating labels. Its `updated` count is never used to guess which outgoing messages were read. Read acknowledgements refresh canonical unread counts in the conversation list.
- `chatApi.ts` exposes `useCreateConversationMutation` for the existing authenticated `POST /chat/conversations` endpoint. The page has a Recipient user ID field, Start conversation button, and the signed-in user's own ID for sharing. The backend returns the existing conversation when the pair already exists. Self-chat, invalid IDs, missing recipients, and other failures use the backend's error response. A newly opened conversation is retained even if it is not on the current list page, with the originating account ID attached to keep it separate across account changes.

No user directory or presence endpoint exists in the inspected backend. The UI therefore accepts a user ID rather than inventing a name/email lookup, and Chat connected describes the socket connection only. A reliable recipient online/offline indicator would require a separate backend capability. The socket still belongs to the open conversation; there is no background chat connection outside that view.

For a local smoke test, sign in as two different users in separate browser profiles. Share the user IDs shown on Messages, start the conversation, type to see the indicator, and exchange messages. Check Enter/Shift+Enter, read labels, unread counts, reconnect recovery, and mobile Back navigation. A hidden/unfocused tab or a reader scrolled up should not send a new read acknowledgement.

The tests use isolated REST fixtures and simulated Socket.IO packets. They verify private conversation creation/reuse/errors, authenticated sends, receiving, deduplication, history pagination, scroll preservation, reconnect recovery, typing throttling/expiry/cleanup, focus-gated read acknowledgements, canonical outgoing read labels, and keyboard behavior. These tests do not change the application database or contact real users.

### Chat viewport layout

Opening a conversation uses a compact Messages/Refresh toolbar and hides the inbox description and user-ID form. The full chat panel is sized from its actual top position to the bottom of the visible viewport, leaving a small bottom gap. Header/toolbar resizing, page scrolling, and visual viewport changes update that size. The grid row is explicitly constrained; message history scrolls inside it while the composer keeps its space. Error messages are above the input row so they do not push Send onto an extra row.

On mobile, workspace navigation is hidden while a conversation is open; Back to conversations restores it. The desktop sidebar stays visible. The browser regression check measures both the text field and Send button against the viewport boundaries at 1385×837, 1280×720, 390×844, and 390×600, including a failed-send notice.

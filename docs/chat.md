# Chat module

Source: [`src/modules/chat`](../src/modules/chat). It provides private one-to-one chat using the existing NestJS application session. RTK Query handles REST data; Socket.IO handles live events. There is no second chat authentication system.

## Route and files

The account route `/dashboard/chat` and Messages sidebar entry are registered in `manifest.ts`.

| File inside the module | Responsibility |
| --- | --- |
| `pages/page.tsx` | Conversation list, pagination, selection, recipient-ID form, and opening/reusing a conversation. |
| `components/message-history.tsx` | Loaded history pages and live messages, chronological deduplication, scrolling, viewport sizing, read-state reconciliation, and the open-chat header. |
| `components/message-composer.tsx` | Authenticated socket lifecycle, text input, sends/acknowledgements, reconnection, typing, and incoming read acknowledgements. |
| `store/services/chatApi.ts` | Conversation/history queries and create-conversation mutation injected into the shared `baseApi`. |
| `types/index.ts` | Conversation, message, and paginated response types. |

Shared appearance is in `src/app/globals.css`. Existing dashboard, auth, session, API, and Redux files provide the shared infrastructure.

## Current UI

The conversation list shows the other participant's name, fallback initial avatar, latest message/time, and unread count. The start form accepts a recipient user ID and displays your own ID for sharing; the backend currently has no public recipient-search API.

Selecting a conversation hides that form and the ID/intro text. The open panel has the recipient's name/avatar and an × icon in its top-right corner. Its accessible label is Close conversation; it returns to the list. There is no manual Refresh button. Query failures still have retry controls, and the socket has a Reconnect action.

The panel height uses its actual top position and the visible viewport bottom. Messages scroll inside the panel; the composer keeps its space at the bottom. Desktop keeps the workspace sidebar and conversation list. On mobile, the open conversation uses the available width and hides workspace navigation until it is closed.

## REST contract

All REST paths are relative to `API_BASE`, normally `http://localhost:5300/api/v1`.

| Request | Purpose |
| --- | --- |
| `POST /chat/conversations` with `{ recipientId }` | Find or create the private pair; returns the existing conversation if it already exists. |
| `GET /chat/conversations?page=...&limit=20` | Current user's conversation summaries. |
| `GET /chat/conversations/:id/messages?page=...&limit=20` | Participant-only history, newest first. |

IDs sent to the real backend are UUIDs. A message contains `id`, `conversationId`, `senderId`, `clientMessageId`, `content`, `isRead`, and `createdAt`. Page responses contain `items`, `page`, `limit`, `total`, and `totalPages`.

Conversation creation uses `direct: true` with the shared authenticated transport. GET requests use that transport as usual. The backend checks participants; knowing an ID is not authorization.

`Conversation` is the RTK Query tag for summaries. `ChatMessage` tags are scoped by conversation ID for history invalidation. Private cache entries reset when the application account changes.

## Socket connection and events

The socket connects to the origin of `API_BASE` plus namespace `/chat`: for the default base, `http://localhost:5300/chat`. This is different from the REST path `/api/v1/chat/...`.

`MessageComposer` creates one socket for the mounted conversation with WebSocket transport and `auth: { accessToken }`. The token comes from `withAccessToken()`; secrets and refresh cookies are not passed to the socket. Existing backend origin settings must permit the frontend origin.

| Event | Direction/payload | Frontend handling |
| --- | --- | --- |
| `message:send` | Client → server: `{ conversationId, clientMessageId, content }` | Wait for `{ ok: true, data: { message, created } }` or the backend error acknowledgement. |
| `message:new` | Server → recipient: message object | Add only to the matching open history; refresh summaries for events in other conversations. |
| `message:read` | Client → server: `{ conversationId }` | Confirm a viewed incoming batch only after a successful acknowledgement. |
| `message:read` | Server → sender: `{ conversationId, readerId, updated }` | Refetch canonical history before displaying new outgoing Read labels. |
| `typing:start`, `typing:stop` | Client → server: `{ conversationId }`; recipient receives conversation/user IDs | Show or clear typing only for the open conversation. |

The backend emits a new message to the other participant; the sender uses its acknowledgement instead of relying on an echo. Other sender tabs/devices can reload/reopen or reconnect to fetch their own sent history; the current backend does not echo each send to them.

## Send and receive flows

```text
Type → Send / Enter → message:send → NestJS saves
→ acknowledgement → outgoing bubble → refresh conversation summary

Other participant sends → NestJS message:new
→ matching history gets incoming bubble → refresh summary/unread counts
```

Blank messages and messages longer than 2,000 Unicode characters are rejected before sending. The input is disabled during an in-flight send. Shift+Enter creates a new line; Enter during IME composition does not submit.

Each intended message gets a `crypto.randomUUID()` client ID. If its ten-second acknowledgement times out, the draft and ID remain. Sending the unchanged draft retries that same payload, allowing the backend to return the saved message without duplicating it. Editing starts a new intended message. There is no automatic offline send queue.

History combines loaded pages and live messages by the server message ID, sorts by creation time then ID, and renders plain text. Duplicate events and overlapping REST pages do not create duplicate bubbles.

## History, scrolling, and recovery

Opening a conversation loads recent history. Load older messages requests the next page and preserves the current scroll position. Confirmed sends scroll to the outgoing message; live incoming messages scroll down only when the reader is near the bottom.

Socket connection/reconnection refreshes summaries and restarts REST history from page 1 to recover messages missed while offline. The reader can load older pages again. Normal transport failures use Socket.IO reconnection; manual Reconnect refreshes the application session before reconnecting, including after access-token expiry.

The socket is active while a conversation is open. Closing it, switching conversations, leaving the page, or signing out removes listeners, clears typing timers, and disconnects. Late callbacks are guarded. This is not a global background chat connection.

## Typing and read receipts

Typing starts are throttled to at most one every three seconds during continuous input. A stop is sent after 1.2 seconds of inactivity, on blur, on send, or before disconnecting. Remote typing expires after five seconds if a stop event is lost.

Incoming reads require loaded history, the reader at the bottom, a visible document, and window focus. The composer batches briefly before emitting. Only the captured message IDs are updated locally after a successful acknowledgement; a later arrival is not assumed read from the earlier response. Read failures offer a retry.

Outgoing Sent/Read labels use backend `isRead` values. Receipt counts alone do not identify which messages were read, so the history component refetches its loaded pages to reconcile them. Successful incoming-read acknowledgements also refresh the backend unread counts.

## Setup, limits, and checks

The backend's existing chat migration must be applied before REST/socket testing. Its chat entities do not create tables through development synchronization. A missing `chat_conversations` table is a backend database setup issue; see the backend migration instructions before applying pending migrations. This frontend module does not run migrations.

No reliable presence API/events exist in the inspected backend. Chat connected describes your socket, not the recipient's online status. Real delivery depends on the backend being available and configured for the frontend origin.

For a manual check, use two registered users in separate browser profiles. Exchange IDs, open the same conversation, send/reply, refresh/reopen history, and check typing/read state. Scroll up to confirm incoming messages do not pull you down; test a hidden tab, reconnect recovery, mobile close navigation, invalid recipient IDs, and a failed send.

Focused coverage is in `tests/chat-composer.test.tsx`, `tests/content-stores.test.ts`, `tests/module-routing.test.ts`, and `tests/e2e/flows.spec.ts`; the isolated REST fixture is `tests/e2e/mock-api.mjs`. Browser tests simulate socket packets and include measured input/Send viewport bounds. They do not prove a real database migration or external deployment configuration.

Related: [Authentication](auth.md), [Shared API/state paths](README.md).

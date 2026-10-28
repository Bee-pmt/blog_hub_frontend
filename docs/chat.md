# Chat module

Source: [`src/modules/chat`](../src/modules/chat). It provides private one-to-one chat using the existing NestJS application session. RTK Query handles REST data; Socket.IO handles live events. There is no second chat authentication system.

## Route and files

The account route `/dashboard/chat` and Messages sidebar entry are registered in `manifest.ts`.

| File inside the module | Responsibility |
| --- | --- |
| `pages/page.tsx` | Conversation list, pagination, selection, recipient-ID form, and opening/reusing a conversation. |
| `components/message-history.tsx` | Loaded history pages and live messages, chronological deduplication, scrolling, viewport sizing, read-state reconciliation, and the open-chat header. |
| `components/chat-provider.tsx` | One shared dashboard socket, authenticated reconnection, unread-total subscription, and sidebar badge. |
| `components/message-composer.tsx` | Text input, sends/acknowledgements, typing, and incoming read acknowledgements through the shared socket. |
| `store/services/chatApi.ts` | Conversation/history/unread-total queries and create-conversation mutation injected into the shared `baseApi`. |
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

IDs sent to the real backend are UUIDs. A message contains `id`, `conversationId`, `senderId`, `clientMessageId`, `content`, `deletedAt`, `isRead`, and `createdAt`. Deleted messages have `content: null` and a deletion timestamp. Page responses contain `items`, `page`, `limit`, `total`, and `totalPages`.

Conversation creation uses `direct: true` with the shared authenticated transport. GET requests use that transport as usual. The backend checks participants; knowing an ID is not authorization.

`Conversation` is the RTK Query tag for summaries. `ChatMessage` tags are scoped by conversation ID for history invalidation. Private cache entries reset when the application account changes.

## Socket connection and events

The socket connects to the origin of `API_BASE` plus namespace `/chat`: for the default base, `http://localhost:5300/chat`. This is different from the REST path `/api/v1/chat/...`.

`ChatProvider`, mounted inside the root Redux provider, maintains one socket while an authenticated user browses dashboard routes with WebSocket transport and `auth: { accessToken }`. The token comes from `withAccessToken()`; secrets and refresh cookies are not passed to the socket. Existing backend origin settings must permit the frontend origin.

| Event | Direction/payload | Frontend handling |
| --- | --- | --- |
| `message:send` | Client → server: `{ conversationId, clientMessageId, content }` | Wait for `{ ok: true, data: { message, created } }` or the backend error acknowledgement. |
| `message:new` | Server → recipient: message object | Add only to the matching open history; refresh summaries for events in other conversations. |
| `message:read` | Client → server: `{ conversationId }` | Confirm a viewed incoming batch only after a successful acknowledgement. |
| `message:read` | Server → sender: `{ conversationId, readerId, updated }` | Refetch canonical history before displaying new outgoing Read labels. |
| `message:delete` | Client → server: `{ messageId }` | Sender-only deletion; wait for the acknowledgement before changing the message locally. |
| `message:deleted` | Server → both participants: `{ messageId, conversationId, deletedAt }` | Replace text with a placeholder and refresh previews/history/unread counts. |
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

Each intended message gets a `crypto.randomUUID()` client ID. If its ten-second acknowledgement times out, the draft and ID remain. Sending the unchanged draft retries that same payload, allowing the backend to return the saved message without duplicating it. Editing starts a new intended message. There is no automatic offline send queue. A send that finishes while the route is hidden clears its busy state, so returning to the cached page does not leave the composer stuck.

History combines loaded pages and live messages by the server message ID, sorts by creation time then ID, and renders plain text. Duplicate events and overlapping REST pages do not create duplicate bubbles.

## History, scrolling, and recovery

Opening a conversation loads recent history. Load older messages requests the next page and preserves the current scroll position. Confirmed sends scroll to the outgoing message; live incoming messages scroll down only when the reader is near the bottom.

Socket connection/reconnection refreshes summaries, clears the old live-message list, and restarts REST history from page 1 to recover messages missed while offline. Older messages are loaded from canonical history again, including deleted placeholders. The reader can load older pages again. Normal transport failures use Socket.IO reconnection; manual Reconnect refreshes the application session before reconnecting, including after access-token expiry.

Closing or switching conversations removes only that composer’s listeners and typing timers. The shared socket stays connected across dashboard pages so unread counts update without an open conversation. Leaving the dashboard or signing out removes shared listeners and disconnects. Late authentication and reconnect callbacks are guarded against account changes. A server disconnect after token expiry refreshes the application session before reconnecting.

## Delete a message

Your own live messages have a trash icon to the left of the bubble that appears on message hover or keyboard focus. It remains visible on touch screens. It opens the shared confirmation dialog. Cancel sends nothing; Delete for everyone sends `message:delete` through the existing authenticated socket. The backend verifies that you sent the message, even if your account is an administrator.

After a successful acknowledgement or `message:deleted` event, the bubble says “This message was deleted.” Its timestamp remains, while its text, Delete button, and Sent/Read label disappear. A deleted last message shows the same placeholder in the conversation preview. The conversation and its history remain.

`MessageHistory` handles confirmation, acknowledgements, errors, and placeholders. The shared `ChatProvider` remembers deletion timestamps for the signed-in account, so bubbles and conversation previews stay deleted even if a refresh fails or an older response arrives. Changing the account clears these timestamps. This also covers deletions received before an older history page loads. Deleted incoming messages are excluded from read requests. A disconnected or failed request leaves the original text in place and shows an error; the same message can be retried safely.

`ChatProvider` listens for deletions across dashboard pages and invalidates the existing RTK Query `Conversation` tag and the affected `ChatMessage` tag. There is no new REST delete endpoint or RTK Query mutation because the backend exposes deletion through Socket.IO. Receiving the event on another tab/device refreshes that device too; reconnecting recovers the canonical placeholders through history.

The backend’s registered `1793145600000-AddMessageDeletion.ts` migration must be applied for the new nullable content/deletion column. This frontend change does not alter the backend or run migrations. See the backend [message deletion guide](../../blog-hub-backend/docs/CHAT_MESSAGE_DELETION.md).

## Messages sidebar badge

The badge shows the total unread **messages**, not the number of conversations. Zero hides it; totals above 99 display `99+`, while the accessible label retains the full count.

`getUnreadChatCount` requests `/chat/conversations?page=1&limit=50`, then every remaining page. It sums each conversation's `unreadCount`, keyed by conversation ID to avoid counting overlapping results twice. This uses the existing backend API and needs no backend change or migration. It fetches summaries, not message bodies. If a page fails, it keeps the previous successful total instead of publishing an incomplete count.

Incoming socket events invalidate the shared `Conversation` cache tag. Successful sends and read acknowledgements also invalidate that tag, refreshing both the conversation list and badge from the server. Connection/reconnection refreshes the baseline. Counts additionally refresh on window focus and every 30 seconds, covering missed events and reads in another tab because the current backend does not broadcast reads back to the reader's other devices. This costs one request per 50 conversations per refresh; a future backend total endpoint would reduce that cost for large inboxes.

The total is stored in RTK Query's existing cache. Account changes reset private caches, hide the previous count, and stop outstanding pagination for the previous account.

## Typing and read receipts

Typing starts are throttled to at most one every three seconds during continuous input. A stop is sent after 1.2 seconds of inactivity, on blur, on send, or before disconnecting. Remote typing expires after five seconds if a stop event is lost.

Incoming reads require loaded history, the reader at the bottom, a visible document, and window focus. The composer batches briefly before emitting. Only the captured message IDs are updated locally after a successful acknowledgement; a later arrival is not assumed read from the earlier response. Read failures offer a retry.

Outgoing Sent/Read labels use backend `isRead` values. Receipt counts alone do not identify which messages were read, so the history component refetches its loaded pages to reconcile them. Successful incoming-read acknowledgements also refresh the backend unread counts.

## Setup, limits, and checks

The backend's existing chat migration must be applied before REST/socket testing. Its chat entities do not create tables through development synchronization. A missing `chat_conversations` table is a backend database setup issue; see the backend migration instructions before applying pending migrations. This frontend module does not run migrations.

No reliable presence API/events exist in the inspected backend. Chat connected describes your socket, not the recipient's online status. Real delivery depends on the backend being available and configured for the frontend origin.

For a manual check, use two registered users in separate browser profiles. Exchange IDs, open the same conversation, send/reply, refresh/reopen history, and check typing/read state. Scroll up to confirm incoming messages do not pull you down; test a hidden tab, reconnect recovery, mobile close navigation, invalid recipient IDs, and a failed send.

Focused coverage is in `tests/chat-provider.test.tsx`, `tests/chat-composer.test.tsx`, `tests/content-stores.test.ts`, `tests/module-routing.test.ts`, and `tests/e2e/flows.spec.ts`; the isolated REST fixture is `tests/e2e/mock-api.mjs`. Browser tests simulate socket packets and include measured input/Send viewport bounds. They do not prove a real database migration or external deployment configuration.

Related: [Authentication](auth.md), [Shared API/state paths](README.md).

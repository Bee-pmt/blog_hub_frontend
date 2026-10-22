# Notifications module

Source: [`src/modules/notifications`](../src/modules/notifications). This module displays backend-generated story moderation notifications for the signed-in user.

## Route and files

The manifest registers the account route `/dashboard/notifications`. It has no normal sidebar text item: the bell beside settings in `DashboardShell` links to this route.

| File inside the module | Responsibility |
| --- | --- |
| `components/notification-bell.tsx` | Sidebar bell, active-link styling, accessible unread label, and badge capped visually at `99+`. |
| `pages/page.tsx` | Notification list, relative timestamps, pagination, read controls, loading/empty/error states. |
| `store/services/notificationApi.ts` | List query and individual/all read mutations injected into `baseApi`. |
| `types/index.ts` | Notification and page response types, including `unreadCount`. |
| `manifest.ts` | Route registration. |

## What a notification contains

The current types support `post_unpublished` and `post_deleted`, with a blog ID/title, message, creation time, and nullable `readAt`. `readAt === null` means unread. The backend creates the notification; the frontend does not infer a notification from a local button click.

Unpublished-story notifications offer an Edit story link. Deleted-story notifications retain their message/title but do not offer that edit link. The page uses contrasting unread styling, a dot, and an action icon.

## Data flow and API

The bell queries page 1 every 30 seconds while it is mounted in the authenticated workspace. The page queries the selected page every 30 seconds and requests a fresh read on mount/argument change. RTK Query shares requests with identical arguments.

| Backend request | Purpose |
| --- | --- |
| `GET /me/notifications?page=...&limit=10` | List ten notifications and return pagination plus total unread count. |
| `PATCH /me/notifications/:id/read` | Mark a specific notification read. |
| `PATCH /me/notifications/read-all` | Mark the user's notifications read. |

Read mutations use `direct: true` with the shared authenticated request path. Successful mutations invalidate `Notification`; the list and bell refresh from the backend. Merely opening the page does not automatically mark every notification read.

`unreadCount` is supplied by the backend and is not calculated from the ten visible rows. The module uses polling, not a notification WebSocket connection.

## Relative time and state

`relativeTime()` in `src/lib/utils.ts` formats labels such as Just now, 1 minute ago, and 1 day ago. The page updates its local clock every 30 seconds; each `<time>` also has the original timestamp and a full-date title.

RTK Query owns notification data. Local React state owns pagination, the display clock, and mutation errors. Account changes clear the shared private cache.

## Manual checks

Use a moderation action that the backend supports against another user's story, then sign in as the owner. Check the bell badge, list text, relative time, and edit-link behavior. Mark one item and all items read, navigate pages, and verify that another account cannot see those notifications. Allow for the polling interval when checking arrival.

Related: [Story moderation](blog.md), [Authentication](auth.md), [Base workspace](base.md).

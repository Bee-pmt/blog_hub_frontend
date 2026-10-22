# Blog module

Source: [`src/modules/blogs`](../src/modules/blogs). The code and backend use the word blog; the UI usually says story. This module owns story requests, editing, management, moderation, public display helpers, and the user's activity history. Public page composition lives in the website module.

## Routes

| Frontend route | Purpose |
| --- | --- |
| `/dashboard` | My stories: status filters, pagination, publishing and deletion. |
| `/dashboard/posts/new` | Create a story. |
| `/dashboard/posts/[id]/edit` | Edit an owned story. |
| `/dashboard/activity` | Actions performed by the current user, with detail dialogs. |
| `/dashboard/admin/posts` | Administrator story moderation. |
| `/dashboard/admin/posts/[id]/edit` | Legacy route that redirects to the admin story list. |

The manifest marks workspace routes as account/admin routes. The admin list provides moderation controls; its rows do not offer author-content editing. Backend authorization remains decisive.

## Files and responsibilities

| File inside the module | Responsibility |
| --- | --- |
| `manifest.ts` and `pages/` | Connect workspace URLs to the manager, editor, activity view, or legacy redirect. |
| `types/index.ts` | Story summaries/full content, pagination, filters, save input, browser drafts, and audit response types. |
| `api.ts` | Public list/detail helpers, save request formatting, and validation/normalization of displayed image URLs. |
| `cache.ts` | Public cached list/detail functions tagged `blogs`. |
| `store/services/blogApi.ts` | Authenticated queries and story/audit mutations in RTK Query. |
| `components/post-manager.tsx` | Author/admin list modes, filters, pagination, publish/unpublish, and delete confirmation. |
| `components/post-editor.tsx` | Form lifecycle, loading existing content/taxonomy, editor modes, image selection, validation, save/delete, and recovery decisions. |
| `components/rich-editor.tsx` | Tiptap visual editing and its formatting controls. |
| `editor-validation.ts` | Save validation and detection of Markdown that should stay in source mode. |
| `hooks/use-draft-recovery.ts` | Debounced browser recovery copies and unsaved-navigation handling. |
| `components/post-list.tsx` | Public story result cards and result pagination. |
| `components/search-filters.tsx` | URL-based public search/refinements and integration with the shared voice button. |
| `components/markdown.tsx` | Markdown display with GFM, skipped raw HTML, restricted URLs, and table/image rendering. |
| `components/blog-image.tsx` | Browser image display with URL checks and an unavailable-image fallback. |
| `components/blog-activity.tsx` | Paginated activity list and native detail dialog showing changes or a saved snapshot. |

## Public reads versus private dashboard reads

Public home/article pages call `getCachedBlogs()` or `getCachedBlog(slug)`. These functions call the public API helpers and use Next.js cache tag `blogs`, with `stale: 0`, `revalidate: 60`, and `expire: 120`. Public responses do not enter the auth slice or dashboard RTK Query cache.

`PostManager`, `PostEditor`, and `BlogActivity` use generated RTK Query hooks. Those call authenticated endpoints through the shared `baseApi`. The `Blog` tag refreshes editable/list data; `BlogAudit` refreshes the current user's activity list after successful story mutations.

## Backend requests

Paths are relative to the configured API base.

| Request | Purpose |
| --- | --- |
| `GET /blogs` | Public list/search/filter/pagination. |
| `GET /blogs/:slug` | Public article detail. |
| `GET /me/blogs`, `GET /admin/blogs` | Author/admin management lists; dashboard requests ten per page. |
| `GET /me/blogs/:id`, `GET /admin/blogs/:id` | Authenticated editable/detail lookup supported by the API service. |
| `POST /blogs` | Create a story. |
| `PATCH /blogs/:id` | Save author changes or change author publication status. |
| `PATCH /admin/blogs/:id/status` | Administrator publish/unpublish operation. |
| `DELETE /blogs/:id` | Delete a story, subject to backend ownership/role rules. |
| `GET /me/blog-audit-logs?page=...&limit=10` | Current actor's activity history. |
| `GET /me/blog-audit-logs/:id` | Activity changes or deletion snapshot. |

Public detail URLs use a slug. Authenticated edit/mutation URLs use an ID; do not interchange them.

## Saving a story

```text
PostEditor → useSaveBlogMutation → api.ts saveBlog
→ contentRequest → mutateContentAction → apiWrapper → NestJS
→ successful public-cache invalidation + RTK Query invalidation
```

`saveBlog()` receives the authenticated sender instead of owning another token/client. Without a selected image it sends JSON. With an image it sends `FormData`, including the selected file and story fields; the browser supplies the multipart boundary.

The content Server Action allows only supported content paths/methods, forwards the application token, and expires the public `blogs` tag after success. Taxonomy changes also expire that tag because they can change story display/filter data. NestJS still validates every request.

## Editor behavior

React Hook Form holds draft fields; local state holds editor mode, selected file, recovery/busy/errors, and server baseline. RTK Query handles server requests. Visual, source, and preview modes share Markdown content; constructs that the visual editor cannot safely preserve stay in source mode.

Client validation includes a nonempty title up to 200 characters, nonempty content up to 100,000 characters, a category for a new story, at most ten tags, tags belonging to the selected category, and valid supported cover URLs. File selection accepts JPEG, PNG, or WebP up to 5 MiB; the backend must verify uploads independently.

Draft recovery uses `bloghub-recovery:<user-id>:<story-id-or-new>` in browser storage, with a debounced copy after one second. It is recovery, not server autosave. An unsaved selected file is not restored from that text copy and must be selected again after reloading.

## Moderation, activity, and safe display

A backend `publicationBlocked` flag prevents an author from publishing a moderated story again. They can still edit/save its draft; an administrator must republish it. UI disabling explains the restriction but does not implement authorization.

My activity describes actions performed by the current actor, rather than every action affecting their stories. Selecting View details fetches that audit entry and opens a native dialog. Changes show old/new values; a deletion can show the preserved snapshot. The backend owns audit creation and access control.

Markdown skips raw HTML and filters link protocols. Image rendering accepts HTTP(S) URLs or the supported backend image path format; it loads images in the browser without a server image proxy.

## Manual checks

Create/save a draft, publish it, edit it, and find it on the public site. Test visual/source/preview switching, taxonomy selection, cover upload, failed saves, recovery after reload, and delete cancellation. As an administrator, moderate another user's story; verify the author's publishing restriction and notification. Open activity details and confirm the changed values/snapshot. Test private data isolation after signing out and switching accounts.

Related: [Website](website.md), [Taxonomy](taxonomy.md), [Notifications](notifications.md), [Authentication](auth.md).

# Administrative permissions and Blog Trash

The frontend uses the existing NestJS JWT/refresh flow. No backend or storage code changed.
The deployed Swagger schema was checked for the user and Trash contracts.

## Permissions

`GET /auth/me` supplies the user's `role` and effective `permissions`. Missing permissions mean no administrative access, including for `super_admin`. Roles alone never unlock management controls.

- `blogs.moderate`: All stories, read-only inspection, status changes, Admin Trash.
- `blogs.delete`: move another author's story to Trash.
- `blogs.restore` / `blogs.purge`: separate restore and permanent-delete grants in Admin Trash.
- `taxonomy.manage`: edit others' categories/tags; owners keep their own editing rights.
- `taxonomy.delete`: delete categories/tags, separately from editing.
- `comments.delete`: delete others' comments/replies, without allowing editing.
- `users.manage`: list users and enable/disable authors. Only `super_admin` may change regular admins' status.
- `users.grant_access`: main-admin promotion and permission editing. This grant and the `super_admin` role cannot be assigned in the UI.
- FAQ manage/delete grants are available in the permission form. This application currently has a public FAQ help widget, not an admin FAQ management screen; none was invented without an admin endpoint contract.

New promotions start with every checkbox unchecked. Existing administrators start with their current grants. Saving sends the selected array, including `[]` to revoke all grants. Super administrators and accounts with `users.grant_access` are protected from these controls. There is no demotion control.

The profile refreshes after user access changes, when the signed-in window regains focus, and after a forbidden authenticated request. A 403 does not retry the failed operation. Account ID, role, or permission changes clear the shared RTK Query cache. Profile refresh responses from a previous session are discarded.

## Trash routes and behavior

- `/dashboard/trash`: My Trash, available to every signed-in account.
- `/dashboard/admin/trash`: Admin Trash, requires `blogs.moderate`.

Both use ten items per page, a full-content preview, deletion dates, empty/loading/error states, and the server's `canRestore` and `canPermanentlyDelete` flags. Admin actions additionally require their separate grants.

Normal `DELETE /blogs/:id` now means **Move to Trash**, with recoverable wording in the feed, management list, and editor. When a version is supplied by the server, deletion includes `?version=N`.

Trash reads use `/me/blog-trash` or `/admin/blog-trash`, plus `/:id` for full content. Restore uses `POST /:id/restore` with no body. Permanent deletion uses `DELETE /:id` on the Trash endpoint and a separate explicit confirmation about deleting comments/replies/reactions/tag links.

Restoration keeps the same UUID and slug, returns a draft, and preserves publication blocks. Owners get an Open draft editor link. Admins restoring someone else's story see that its author can edit the draft; moderation does not grant content rewriting. An owner cannot restore an admin-trashed post through My Trash, but can permanently delete it when allowed by the response.

There is no automatic expiry or client-side image deletion. Restore/purge remain online actions. No offline post-sync implementation exists in this frontend, so there is no sync queue or snapshot reconciliation code to modify.

## Cache and errors

Blog mutations invalidate RTK blog lists/details, Trash, history, comments, reactions, and notifications. The existing Server Action expires the public Next.js `blogs` cache. 404/409 mutation responses also expire/refetch affected caches, without replaying the mutation. The editor reloads current state after these errors and preserves its recovery copy.

401 follows the existing token refresh/login behavior. 403 displays the backend explanation and refreshes the profile. A missing preview refreshes the underlying list. Other network/API failures leave a readable error and an explicit refresh action.

Audit actions are displayed safely, with underscores converted to spaces; unknown actions still have a readable fallback. Notifications display the server message, handle restoration/permanent-deletion icons, and send trashed-post notifications to My Trash rather than a public article.

## Files

- `src/modules/auth/permissions.ts`: shared grant check and assignable grants.
- `src/modules/auth/store/slices/authSlice.ts`, `src/lib/ReduxProvider.tsx`, `src/lib/store/index.ts`, `src/lib/api/baseApi.ts`: profile refresh, session protection, permission cache reset, forbidden handling.
- `src/moduleTypes.ts`, `src/moduleRegistry.tsx`, workspace shell and blogs/users manifests: route and navigation access.
- `src/modules/users/{types,components/user-manager.tsx,store/services/userApi.ts}`: roles, main-admin checkboxes, promotion/permission/status APIs.
- `src/modules/blogs/components/{blog-trash,blog-preview,post-manager,post-editor,post-list,comment-section,blog-activity}.tsx`: Trash, inspection, permission-aware actions, revised deletion text, audit actions.
- `src/modules/blogs/{types,store/services/blogApi.ts,store/services/commentApi.ts,pages/trash/page.tsx}` and `src/actions/content.ts`: contracts, queries/mutations, cache invalidation, Trash routes.
- Taxonomy manager and notification types/page: grant checks and new events.
- `src/app/globals.css`: permission checkbox alignment; existing design preserved.
- Unit/Playwright tests and mock API: updated contracts and regression checks.

## Manual verification

1. As an author, trash an owned story. Confirm it disappears from normal/public lists. Open My Trash, preview it, and restore it. Open the returned draft and publish normally when unblocked.
2. Trash it again. Cancel permanent deletion, then confirm it. Confirm the item and its Trash count disappear.
3. As a limited admin, verify only granted links/actions appear. `blogs.moderate` alone must not show other-author trashing or admin restore/purge.
4. As the main admin, promote a disposable author. Verify all checkboxes start unchecked, grant selected permissions, then clear them and save again. Confirm protected accounts have no access-changing controls.
5. Trash another author's blocked story as an authorized admin. As the author, verify My Trash explains the restore restriction and still offers permanent deletion when allowed. Restore through Admin Trash and verify it remains a blocked draft.
6. Test 401/403/404/409 and network failures. No automatic 403/409 mutation retries should appear in the network log. Check lists and pagination totals after each successful operation.
7. Check the new UI on mobile and in both themes. Browser tests use an isolated mock API, not real production accounts.

No deployment is performed by this change.

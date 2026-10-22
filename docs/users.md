# Users module

Source: [`src/modules/users`](../src/modules/users). This module provides administrator account management and user types shared by authentication.

## Route and files

The manifest registers `/dashboard/admin/users` with admin access and the sidebar link Users · Admin.

| File inside the module | Responsibility |
| --- | --- |
| `manifest.ts` | Route and admin navigation registration. |
| `pages/admin/page.tsx` | Renders the user manager. |
| `components/user-manager.tsx` | Search form, paginated user table, role/status controls, confirmation dialog, and operation feedback. |
| `store/services/userApi.ts` | `getUsers` query and `updateUser` mutation in the shared `baseApi`. |
| `types/index.ts` | Authenticated `User`, admin `ManagedUser`, and paginated response types. |

## Data flow

The manager calls `useGetUsersQuery({ q, page })`. RTK Query sends an authenticated GET through `authenticatedRequest` and `apiWrapper`. The response is cached by the search/page arguments.

Selecting a role or account status creates a pending change. Confirmation calls `useUpdateUserMutation`. Its request has `direct: true`, so it uses the authenticated transport rather than the blog/taxonomy Server Action. A successful update invalidates the `User` tag.

If an administrator changes their own account, the manager calls auth `restore()` to reload the actual current account. The shared store resets private API cache data when the account ID or role changes.

## Backend requests

| Method and path | Purpose |
| --- | --- |
| `GET /admin/users?q=...&page=...&limit=10` | Search by name/email and list ten users per page. |
| `PATCH /admin/users/:id/role` | Send `{ role }` to change the role. |
| `PATCH /admin/users/:id/status` | Send `{ status }` to enable/disable account access. |

The role choices are author/admin; the status choices are active/disabled. The UI explains that deactivation preserves stories while removing account access. NestJS owns session revocation and any restrictions on managing administrators or the current account. Frontend controls do not override backend decisions.

## State and boundaries

React Hook Form handles the search field; local state tracks the submitted query, page, pending confirmation, and busy/errors. RTK Query holds user-list responses. The auth module, not this manager, owns the signed-in account state.

This is an admin directory, not a public recipient-search API for chat. It does not implement registration, Google identity verification, or password changes; those belong to the auth module.

## Manual checks

Sign in as an administrator, search for a user, navigate pages, cancel/confirm a role or status change, and check failure feedback. Verify that an author cannot access the admin route/API. If testing your own role, use a disposable account and ensure another administrator remains available.

Related: [Authentication](auth.md), [Routing and shared state](README.md).

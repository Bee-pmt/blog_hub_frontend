# Authentication module

Source: [`src/modules/auth`](../src/modules/auth). It provides email/password and Google sign-in for the same NestJS application account. NestJS owns users, roles, password checks, access tokens, and refresh sessions. Auth.js handles the Google OAuth exchange, not a separate BlogHub application session.

## Frontend routes

| Route | Module page | Purpose |
| --- | --- | --- |
| `/login` | `pages/login/page.tsx` | Sign in with a password or continue with Google. |
| `/register` | `pages/register/page.tsx` | Create an account or start Google registration. |
| `/forgot-password` | `pages/forgot-password/page.tsx` | Request an email code, then submit the code and a new password. |
| `/settings` | `pages/settings/page.tsx` | Change password and offer Google account linking. |
| `/auth/google` | `pages/google/page.tsx` | Google completion form or OAuth error/retry state. |

`manifest.ts` registers these routes without a workspace `access` flag. The change-password form performs its own session/loading checks and offers a sign-in link to guests. The settings page is not a `DashboardShell` route.

## Main files

| File inside the module | Responsibility |
| --- | --- |
| `components/auth-form.tsx` | Shared login/register form, registration success, password login, and return navigation. Google is placed below the normal form. |
| `components/password-form.tsx` | Password-change and forgot/reset modes, confirmation validation, resend cooldown, and account-session checks. |
| `components/account-nav.tsx` | Header sign-in/profile navigation based on the current account. |
| `hooks/useAuth.ts` | Convenient access to Redux auth state and dispatching login, restore, logout, password-change, and Google actions. |
| `store/slices/authSlice.ts` | Account state and asynchronous operations. Ignores stale auth operation results using request IDs. |
| `api.ts` | Registration/current-user helpers, backend auth-session request helper, and safe local return-path validation. |
| `actions.ts` | Server Actions for auth operations, copying/clearing the refresh cookie, and password recovery. |
| `google.ts` | Server-only Auth.js Google configuration, exported handlers/sign-in, encrypted handoff reading and cleanup. |
| `google-actions.ts` | Starts OAuth, prepares the completion form through NestJS, and completes login/linking. |
| `components/google-button.tsx` | Starts the Google Server Action. |
| `components/google-form.tsx` | Requests the password or confirmation appropriate to the backend's Google preparation result. |
| `types/index.ts` | Registration input and access-token response types. |

The Auth.js HTTP handler lives outside the module at [`src/app/api/auth/[...nextauth]/route.ts`](../src/app/api/auth/[...nextauth]/route.ts). It exposes endpoints such as `/api/auth/callback/google` by forwarding the handlers exported from `google.ts`.

## Password login flow

1. `AuthForm` calls `useAuth().login(formData)`.
2. `loginAuth` invokes `submitAuthAction("login", formData)`.
3. The Server Action calls NestJS `POST /auth/login`, forwards the relevant request headers, and copies the backend refresh cookie into the frontend response.
4. `setSession()` in `src/lib/session.ts` keeps the returned access token and expiry in browser module memory.
5. The thunk calls `GET /auth/me` through `authenticatedRequest` and stores the returned application user in Redux.
6. The form navigates to a validated local `returnTo`, defaulting to `/dashboard`.

Registration uses `POST /auth/register` and shows a success/sign-in path. It does not automatically create a password-login session.

## Session restoration and storage

`src/lib/ReduxProvider.tsx` creates one Redux store for the mounted provider and dispatches `restoreAuth()`. Restoration refreshes the existing application session, then requests `/auth/me`. A BroadcastChannel coordinates login/logout across tabs when the browser supports it.

- Redux stores the account, loading/error state, and current auth request ID.
- The access token is in `src/lib/session.ts` memory, not in Redux or `localStorage`.
- The `bloghub_refresh` cookie is HttpOnly and is handled by Server Actions.
- `withAccessToken()` reuses a valid token or refreshes it, with one unauthorized retry for applicable operations. Password change disables that retry so a wrong current password does not automatically end the session.
- The shared API layer ends the session on unrecoverable authenticated 401 responses. Account ID/role changes reset the RTK Query cache.
- Signing out clears session state, broadcasts logout, and removes that user's browser draft-recovery entries.

## Password recovery and change

`POST /auth/forgot-password` requests a code. `POST /auth/reset-password` submits the email, six-digit code, and new password. The form checks password confirmation and the minimum-character/maximum-UTF-8-byte limits before submission; NestJS still validates the request and code.

Signed-in password change calls `POST /auth/change-password` with the existing and new password. Successful change/reset ends the frontend session; the user signs in again. The backend owns password hashing and session invalidation.

## Google flow

```text
Google button → startGoogleAction → Auth.js Google OAuth callback
→ encrypted HttpOnly handoff cookie → /auth/google
→ prepareGoogleAction → NestJS /auth/google/prepare
→ required completion form → NestJS /auth/google or /auth/google/link
→ existing NestJS application session → Redux account
```

The encrypted handoff lasts ten minutes. Server code reads its Google ID token; the browser does not submit a plain email as identity proof. NestJS re-verifies the token before account creation/linking.

| Backend preparation result | Completion behavior |
| --- | --- |
| New Google email | Set and confirm a password before the user/link is created. |
| Existing email, Google not linked | Confirm the existing BlogHub password once before linking. |
| Google already linked | Continue without a BlogHub password. |
| Explicit link from settings | Use the signed-in application token and current password; the backend checks the Google/account relationship. |

Configuration uses frontend server environment variables `AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`; NestJS uses its matching `GOOGLE_CLIENT_ID`. Never place the client secret or server JWT secret in a `NEXT_PUBLIC_*` variable. See [google-login.md](google-login.md) for setup details.

## Manual checks

Register, sign in, reload to restore the session, sign out, and check another open tab. Test valid/invalid current passwords and recovery codes. For Google, test first-time existing-account linking, new-account password setup, and later password-free Google login with real OAuth configuration. Verify that normal email/password login still works afterward.

Related: [Shared data paths](README.md), [Base workspace](base.md), [Users](users.md).

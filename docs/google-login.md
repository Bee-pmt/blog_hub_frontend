# Google login: setup and workflow

Google is another way to sign in to the same BlogHub account. NestJS still owns users, passwords, roles, access tokens, and refresh sessions. Auth.js only handles the Google OAuth transaction and supplies the identity proof.

## What the user sees

| Situation | What happens |
| --- | --- |
| Google email is new | Enter and confirm a password. Only then create the user and Google link together. Both password and Google login work afterward. |
| Email already exists, Google is not linked | Enter the existing BlogHub password. Check it before linking. Keep the existing user ID, password, role, and stories. |
| Google is already linked | Continue without entering a BlogHub password. |
| Linking from account settings | Verify Google, then confirm the current BlogHub password. The Google email must match the signed-in account for a new link. |
| Google callback is cancelled, invalid, or expired | Show a retry/sign-in link. Do not create a user or session. |

The Google button appears on login and registration. Account settings shows Link Google, or a linked message. The `/auth/google` completion screen uses the same card, field, and button styles as the existing forms.

Matching email alone never links an existing account. Password proof is required once; no users are merged or replaced. An already linked Google subject remains attached to its original application user even if their email later changes.

## Request flow

```text
Continue with Google
  -> Auth.js starts OAuth and validates the Google callback
  -> encrypted, HttpOnly, ten-minute handoff cookie
  -> /auth/google completion page
  -> Next.js server sends the Google ID token to NestJS /auth/google/prepare
  -> NestJS verifies Google and returns login / link / register
  -> user submits the required form
  -> Next.js Server Action calls NestJS /auth/google (or /auth/google/link from settings)
  -> NestJS verifies Google again and checks the password if needed
  -> PostgreSQL transaction writes the user/link and creates the normal session
  -> Next.js copies the NestJS refresh cookie into its browser response
  -> existing Redux authentication and NestJS access JWT are used
```

The completion page GET only prepares the form. Sign-in/account creation happens on form submission. The browser does not supply a trusted email, role, or user ID. It also does not receive the Google ID token in JavaScript/session JSON.

## Why backend changes were necessary

A table only stores the provider relationship. The backend must also verify the Google token, check the existing password, prevent duplicate users, and issue application tokens. The implementation reuses AuthService, AuthRepository, GoogleTokenService, and the existing `createSession` helper. There is no separate application authentication system.

`auth_accounts` holds `user_id`, `provider = google`, and Google's stable subject as `provider_account_id`. Unique constraints protect the identity and one-Google-account-per-user relationship. New Google registrations now have a normal bcrypt password hash. The existing nullable password column is retained for compatibility; older passwordless users can establish a password through verified password recovery.

Google identity verification uses the backend's existing `google-auth-library`. The Google client secret is not required by NestJS. Google recommends verifying the token signature, intended audience, issuer and expiry with a maintained library. See [Google's verification guide](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Local setup

1. In Google Cloud, configure the consent screen and a web OAuth client. Add test users if the consent app is in testing mode.
2. Add this exact authorized redirect URI: `http://localhost:3000/api/auth/callback/google`. Use your actual HTTPS frontend origin in production. See [Auth.js Google configuration](https://authjs.dev/reference/core/providers/google).
3. In the frontend's **local `.env.local`**, set these server-side values:

   ```dotenv
   NEXT_PUBLIC_API_BASE_URL=http://localhost:5300/api/v1
   AUTH_URL=http://localhost:3000
   AUTH_SECRET=<a-new-random-secret>
   AUTH_GOOGLE_ID=<Google-web-client-ID>
   AUTH_GOOGLE_SECRET=<Google-web-client-secret>
   ```

   Generate `AUTH_SECRET` with `openssl rand -base64 32`. Use a separate secret from the backend JWT secret. Do not commit actual credentials or prefix them with `NEXT_PUBLIC_`.

4. In the backend's **local `.env`**, set `GOOGLE_CLIENT_ID` to the same client ID and ensure `FRONTEND_ORIGINS` includes `http://localhost:3000`. Keep your existing JWT, database, and mail configuration.
5. Ensure the existing Google-account migration has been applied to the intended database. Do not rerun unrelated seeds. The backend's current development synchronization can already have created the table. See [backend Google documentation](../../blog-hub-backend/docs/GOOGLE_AUTH.md).
6. Restart both development servers. Test a new Google email, an existing password account, then another Google sign-in after linking.

Without these Google credentials, email/password authentication still works and the Google button reports that Google login is not configured. Real Google OAuth requires valid credentials; local test fixtures do not replace that setup.

## Files and responsibilities

| File under `src/` | Purpose |
| --- | --- |
| `modules/auth/google.ts` | Auth.js Google configuration, private handoff reading and clearing. |
| `app/api/auth/[...nextauth]/route.ts` | Required Auth.js GET/POST route handlers. |
| `modules/auth/google-actions.ts` | Begin OAuth, prepare the form, complete sign-in/linking. |
| `modules/auth/pages/google/page.tsx` | Completion screen and callback error handling, registered in the existing manifest. |
| `modules/auth/components/google-button.tsx` | Shared login/register/settings button and linked status. |
| `modules/auth/components/google-form.tsx` | Password setup, password confirmation, or linked-account continuation. |
| `modules/auth/actions.ts` and `api.ts` | Reuse the existing cookie transfer for the Google application session. |
| `modules/auth/store/slices/authSlice.ts` and `hooks/useAuth.ts` | Use the same Redux user state and session lifecycle after Google login. |

No Auth.js database adapter, duplicate user store, global SessionProvider, Google module hierarchy, or new password storage mechanism is added. Auth.js is pinned in package.json; its current Next.js installation uses the v5 beta release described in the [official installation instructions](https://authjs.dev/getting-started/installation).

## Session and security behavior

- Auth.js performs its OAuth checks. NestJS independently verifies the Google ID token; an Auth.js session token or a plain email is not accepted instead.
- The temporary Auth.js cookie expires after ten minutes and is cleared after success and application logout. It grants no NestJS permissions and is never automatically exchanged on session restore. Auth.js encrypts its JWT cookie by default; see [the callback documentation](https://authjs.dev/reference/core).
- The existing application access token is held in memory. The application refresh token stays HttpOnly. Ordinary refresh/logout still use NestJS, including session revocation after password changes and account disable.
- New user/link/session writes are atomic and database unique constraints handle concurrent attempts. Signup preserves the default author role; Google cannot choose an admin role.
- The settings link uses the current application Bearer token and current password. Wrong password or mismatched email does not replace the signed-in account.
- Do not log tokens/passwords, expose them in session JSON, accept external return URLs, or treat Origin/CORS alone as proof of identity. Server Actions retain Next.js's Origin protections.
- Backend rate limiting still sees the Next.js server as the source of server-side requests. A public multi-user deployment should configure trusted proxy/client tracking deliberately rather than trusting arbitrary forwarded headers.

## Verification

Run frontend `npm run typecheck`, `npm run lint`, and `npm test`; run backend `npm run build`, `npm run lint`, and `npm test`. Browser tests use a disposable mock backend and real encrypted handoff-cookie fixtures, without Google credentials. Backend token tests exercise the signature verifier separately. Complete one real Google OAuth round trip after local credentials are configured.

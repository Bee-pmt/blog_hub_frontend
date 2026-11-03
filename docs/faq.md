# BlogHub FAQ help

The floating headset button opens BlogHub Help for visitors and signed-in users.
It uses predefined backend FAQ answers. There is no AI integration, human-support
promise, Supabase connection, or new package.

## Files

- `src/modules/base/components/faq-help.tsx`: the headset launcher, native dialog,
  category filter, suggestions, message history, question form, cooldown, and
  scrolling. Its small suggestion-button subcomponent is reused for initial
  topics and suggestions returned with an answer.
- `src/modules/base/faq-api.ts`: FAQ response types and public requests through
  the existing `apiWrapper()`. It reads `Retry-After` via `onResponse`, supports
  cancellation and timeouts, and does not invoke authentication or retry helpers.
- `src/app/layout.tsx`: mounts help once in the shared root layout. Closing the
  panel or using client-side page navigation does not discard its state.
- `src/app/globals.css`: panel, headset button, message bubbles, and responsive
  form styles using the existing theme variables.
- `tests/faq.test.ts`: request and rate-limit parsing tests.
- `tests/e2e/mock-api.mjs` and `tests/e2e/flows.spec.ts`: isolated FAQ contract
  fixtures and browser checks. They never write to the deployed backend.

## Request flow

No FAQ requests run until Help is opened. Opening it first loads categories and
five suggestions. Changing the category fetches new suggestions using its UUID;
previous filter requests are aborted so late responses cannot replace the new
selection. Failed metadata requests have explicit manual retry buttons.

Sending a question trims and validates 1–500 characters with at least one Unicode
letter or number. It adds a user message and sends `POST /faq/ask`. Both matched
and fallback answers are displayed as normal support messages. Returned suggested
questions are clickable; each uses `GET /faq/:id` for the exact answer.

While a question or FAQ detail is pending, Send and suggestion buttons are
blocked. Questions and answers are plain text. Draft questions remain after a
failure. Closing the panel allows an in-flight response to finish; reopening it
shows the same conversation. A full reload clears history. Nothing is persisted
in localStorage, Redux, or a database.

The native dialog handles keyboard focus containment and Escape. Opening focuses
the question input, and closing restores focus to the headset button. New messages
scroll into view only when the reader is near the bottom. Scrolling up preserves
the reader's position when another answer arrives.

## Rate limits

Failed requests are never automatically retried. On HTTP 429, a clear wait message
appears and request controls are blocked until the cooldown expires, including
when the panel is closed and reopened. The helper understands `Retry-After`
seconds and future HTTP dates. Missing, invalid, or expired headers use a
conservative 60-second wait.

For browser JavaScript to read this header across origins, the backend must expose
`Retry-After` in CORS response headers. If it does not, the frontend uses the
60-second fallback. No backend changes were made for this feature.

## Test locally

```sh
npm run lint
npm run typecheck
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome npx playwright test --grep 'FAQ help '
```

The browser command builds a production frontend and uses the existing isolated
mock server. Omit the Chrome environment variable if Playwright Chromium is
installed, or use your local executable path.

Manual checks:

1. Open the headset button while signed out. Try category filtering, an exact FAQ,
   and an unknown question. Follow a returned suggestion.
2. Close with Escape and check focus returns to Help. Reopen, navigate to another
   page with a site link, and confirm history remains. A full reload should reset it.
3. Repeat while signed in. Network requests to `/faq/*` must not include Bearer
   tokens or cookies.
4. Try spaces and punctuation-only input, a failed request, an unavailable FAQ,
   and a 429. Confirm requests are sent only after an explicit user action and
   remain blocked during the rate-limit wait.
5. Check mobile width and both themes. Scroll up in a long conversation and
   confirm incoming answers do not jump it to the bottom.

## Vercel

Commit and push the frontend changes to the branch connected to Vercel. No new
secret or environment variable is needed. Keep the existing setting:

```env
NEXT_PUBLIC_API_BASE_URL=https://blog-hub-backend-cnzm.onrender.com/api/v1
```

Deploy the new commit, then run the manual checks on the deployed site. The
backend FAQ endpoints and its CORS allowlist must already support your Vercel
origin. Local tests use a mock API; they do not establish live server readiness.

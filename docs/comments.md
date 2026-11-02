# Blog comments

Published articles show comments below the story. Anyone can read them. Sign in
with the existing BlogHub account to post a comment or reply.

## Files and flow

- `src/modules/website/pages/Article.tsx` passes `post.id` (the UUID, not the slug)
  to the comment section. The article stays a Server Component.
- `src/modules/blogs/components/comment-section.tsx` contains the section and its
  small reusable form, list, and row subcomponents. Comments and open reply
  threads each have their own page state. Replies load only when opened.
- `src/modules/blogs/store/services/commentApi.ts` defines RTK Query reads,
  create/reply/edit mutations, and deletion. Successful writes invalidate the
  comment lists for that blog so their items and totals refresh. An empty last
  page moves back to the last available page.
- `src/modules/blogs/types/index.ts` contains comment and pagination types.
- `src/lib/api/baseApi.ts` supports unauthenticated public GET requests through
  the existing API wrapper. Other comment requests use the existing authenticated
  transport, which supplies the NestJS Bearer access token and handles refresh.
  The existing wrapper already supports DELETE responses with status 204.
- `src/app/globals.css` adds a few layout rules using the existing theme tokens.

Own comments/replies can be edited and deleted. Admins can delete others' content
but cannot edit it. Owning a story gives no extra comment permissions. NestJS
must enforce the same rules; hiding buttons is only the UI part.

Text is rendered as plain React text with preserved line breaks. Forms trim input,
accept 1–2000 characters, prevent duplicate submission, and keep drafts on failure. Switching accounts or signing out clears local forms.
Deleting a top-level comment warns that all its replies will also be deleted.
Replies have no Reply action, so the UI supports one level only.

## Local checks

```sh
npm run lint
npm run typecheck
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome npx playwright test --grep 'comments (allow|create|let|recover)'
```

The browser tests build a production frontend and run against an isolated mock
API, not your real database. Use your installed Chrome path or omit the environment
variable if Playwright's own Chromium is installed.

Manual checks on a published story:

1. Signed out: read comments, open replies, and follow the sign-in link.
2. Signed in: submit a comment, edit it, and post/edit/delete a reply.
3. Try spaces-only input and verify a failed request keeps the draft.
4. Verify an author cannot moderate another user's comment, including on their
   own blog. Verify an admin can delete others' comments but cannot edit them.
5. Cancel then confirm deletion of a parent with replies.
6. With more than ten comments/replies, test each pager separately and delete the
   only entry on the last page. Totals and the selected page should recover.
7. Check a narrow screen and both themes. If a post is unpublished while open,
   the API's 404 should show an error instead of a successful submission.

## Vercel deployment

1. In the frontend Vercel project's Settings → Environment Variables, set this
   value for Production (and Preview if those deployments should use this API):

   ```env
   NEXT_PUBLIC_API_BASE_URL=https://blog-hub-backend-cnzm.onrender.com/api/v1
   ```

2. Keep your existing auth environment variables. No new secret is required.
3. Commit and push these frontend changes to the repository and branch connected
   to this Vercel project. If the repository contains multiple projects, ensure
   Vercel's Root Directory points at this frontend folder.
4. Wait for the new deployment to finish. Environment-variable changes require
   a new deployment; redeploying an old commit does not include local changes.
5. On Render, ensure the deployed NestJS backend includes the comment endpoints
   and its `FRONTEND_ORIGINS` includes
   `https://blog-hub-frontend-one.vercel.app` (no trailing slash). This is required
   for browser requests with Authorization headers. Add specific preview origins
   separately if using them. No backend source changes are part of this feature.
6. Open a published article on the new deployment and run the manual checks above.
   In the browser Network panel, comment list requests must use the blog UUID;
   mutations must have the existing Bearer token and successful DELETE returns 204.

Vercel reference: https://vercel.com/docs/environment-variables

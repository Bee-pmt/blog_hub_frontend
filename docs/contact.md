# Contact us

The public `/contact` route belongs to the existing website module. Both visitors and signed-in users can open it through the footer. It reuses `TextField`, React Hook Form, the current authentication state for optional prefills, theme tokens, and `apiWrapper`; no dependency or backend changes are required.

## Files and request flow

- `src/modules/website/pages/Contact.tsx`: contact layout, editable fields, validation, temporary CAPTCHA state, submission and feedback.
- `src/modules/website/manifest.ts`: public route and page title.
- `src/app/layout.tsx`: Contact Us footer link.
- `src/app/globals.css`: contact-only styles and footer-link styling.
- `.env.example`: public site-key setup.
- `tests/e2e/contact.spec.ts`: isolated fake Google widget and contact responses; it never sends support emails.

The deployed Swagger definition at `/api/docs-json` was inspected before implementation. The confirmed contract is:

```text
POST /api/v1/contact
{ name, email, subject, message, captchaToken }
200 { message }
400 invalid fields or invalid/expired/reused/wrong-hostname CAPTCHA
429 three attempts per IP per 15 minutes
503 configuration, CAPTCHA-provider, or mail-service failure
```

The form calls `${API_BASE}/contact` using the existing wrapper with `credentials: "omit"`. It supplies no Authorization header, does not use the authenticated transport or refresh flow, and never retries the POST automatically. The application's existing global session restoration remains unchanged.

Name is trimmed and validated to 2–100 characters, email to a valid address of at most 254 characters, subject to 3–150 characters, and message to 10–2000 characters. NestJS remains authoritative. Success displays fixed acceptance copy and clears the form; failures retain its text and never display internal backend errors. A valid, readable Retry-After header disables submission until its delay/date has elapsed; without one, the form shows the rate-limit message without inventing a waiting period.

Google's reCAPTCHA v2 Checkbox API loads through `next/script` only on this page. The compact widget fits mobile forms and uses the current theme. Changing theme recreates the widget and clears its old token. Tokens exist only in component state, expire through Google's callback, and reset after every submission attempt, including network failures where a token might already be consumed. Missing site-key configuration disables submission. Script/widget errors show a readable message rather than bypassing verification.

Google integration reference: [reCAPTCHA v2 display and callbacks](https://developers.google.com/recaptcha/docs/display).

## Local and Vercel setup

1. Create a **Google reCAPTCHA v2 Checkbox** site key compatible with the backend's configured verification secret. Register `localhost` for local development and the exact deployed Vercel/custom hostname you use for BlogHub. Add any preview hostname you actually intend to test. Follow Google's [key administration](https://www.google.com/recaptcha/admin/create) setup.
2. Add the public key to the frontend's `.env.local`:

   ```env
   NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_public_v2_checkbox_site_key
   NEXT_PUBLIC_API_BASE_URL=https://blog-hub-backend-cnzm.onrender.com/api/v1
   ```

   For a local API, retain the existing local API base instead. Never put the backend CAPTCHA secret or mail credentials in the frontend.
3. Restart the local Next.js server after changing environment variables.
4. In Vercel, open the frontend project's **Settings → Environment Variables**, add `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, and confirm the existing `NEXT_PUBLIC_API_BASE_URL`. Select the environments where the form should work, then redeploy; public variables are included during the build.
5. Confirm that the backend already has the matching secret, mail delivery configured, and CORS permission for the frontend origin. To display the Retry-After countdown on a cross-origin response, the backend must make that header readable through its existing CORS configuration. This implementation does not change backend settings.

## Manual verification

- As a visitor, open `/contact`, submit empty/short values, and check the messages beside each field.
- Complete the real Google checkbox and send one intentional test message. Confirm backend acceptance, cleared fields, and a fresh checkbox. Check delivery separately; frontend success does not prove inbox delivery.
- As a signed-in user, verify editable name/email prefills. Contact submission still requires no access token.
- Test an expired CAPTCHA and provider/network failure. Text should remain available, with verification required again.
- Check light/dark appearance and widths 375, 768, 1280, and 1440px.
- Verify real deployed 429 behavior and readable Retry-After information without repeatedly sending real mail.

The automated suite uses a non-production key only in Playwright's test-build environment and intercepts Google's script and the contact POST. There is no test-key or fake-token bypass in application code. Real Google verification, domain configuration, rate limiting and email delivery still require a manual check after setup.

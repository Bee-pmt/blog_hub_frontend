import { test, expect, type Page } from "@playwright/test";
const api = "http://localhost:5301/api/v1";

async function mockCaptcha(page: Page) {
  let loads = 0;
  await page.route("https://www.google.com/recaptcha/api.js?**", route => {
    loads++;
    return route.fulfill({ contentType: "application/javascript", body: `
      (() => {
        let sequence = 0, current, id = 0;
        const widgets = new Map();
        window.grecaptcha = {
          render(element, options) {
            const widgetId = id++;
            current = options;
            element.dataset.captchaTheme = options.theme;
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Complete test CAPTCHA';
            button.onclick = () => options.callback('test-token-' + (++sequence));
            element.append(button);
            widgets.set(widgetId, button);
            return widgetId;
          },
          reset(widgetId) {
            document.body.dataset.captchaResets = String(Number(document.body.dataset.captchaResets || 0) + 1);
            widgets.get(widgetId)?.removeAttribute('data-completed');
          }
        };
        window.addEventListener('captcha-expire', () => current['expired-callback']());
        window.addEventListener('captcha-error', () => current['error-callback']());
        window.bloghubContactCaptchaReady?.();
      })();` });
  });
  return () => loads;
}

async function fillContact(page: Page) {
  const form = page.getByRole("form", { name: "Contact us", exact: true });
  await form.getByLabel("Name (required)", { exact: true }).fill("  Example User  ");
  await form.getByLabel("Email (required)", { exact: true }).fill("user@example.com");
  await form.getByLabel("Subject (required)", { exact: true }).fill("  Technical Issue  ");
  await form.getByLabel("Message (required)", { exact: true }).fill("  I cannot publish my blog post.  ");
  return form;
}

test.beforeEach(async ({ page, request }) => {
  await request.post(`${api}/__reset`);
  await mockCaptcha(page);
});

test("public contact validates fields, expires CAPTCHA, sends one anonymous request and resets on success", async ({ page }) => {
  let calls = 0;
  let finish: (() => void) | undefined;
  const hold = new Promise<void>(resolve => { finish = resolve; });
  await page.route(`${api}/contact`, async route => {
    calls++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBeUndefined();
    expect(route.request().headers().cookie).toBeUndefined();
    expect(route.request().postDataJSON()).toEqual({ name: "Example User", email: "user@example.com", subject: "Technical Issue", message: "I cannot publish my blog post.", captchaToken: "test-token-2" });
    await hold;
    await route.fulfill({ status: 200, json: { message: "Your message has been sent successfully." } });
  });
  await page.goto("/contact");
  await expect(page.getByRole("heading", { name: "Get in touch." })).toBeVisible();
  const form = page.getByRole("form", { name: "Contact us", exact: true });
  await form.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(form.getByLabel("Name (required)", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByText("Enter a valid email address.", { exact: true })).toBeVisible();
  await expect(form.getByText("Message must contain 10–2000 characters.", { exact: true })).toBeVisible();
  await fillContact(page);
  await form.getByLabel("Name (required)", { exact: true }).fill(" A ");
  await form.getByLabel("Email (required)", { exact: true }).fill("invalid");
  await form.getByLabel("Subject (required)", { exact: true }).fill(" x ");
  await form.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(form.getByText("Name must contain 2–100 characters.", { exact: true })).toBeVisible();
  await expect(form.getByText("Subject must contain 3–150 characters.", { exact: true })).toBeVisible();
  await fillContact(page);
  await form.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(form.getByText("Please complete the CAPTCHA verification.", { exact: true })).toBeVisible();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Complete test CAPTCHA" }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("captcha-expire")));
  await expect(form.getByText("Verification expired. Please complete the CAPTCHA again.")).toBeVisible();
  await form.getByRole("button", { name: "Send message", exact: true }).click();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Complete test CAPTCHA" }).click();
  await form.evaluate(element => { (element as HTMLFormElement).requestSubmit(); (element as HTMLFormElement).requestSubmit(); });
  await expect(form.getByRole("button", { name: "Sending…", exact: true })).toBeDisabled();
  await expect.poll(() => calls).toBe(1);
  finish!();
  await expect(form.getByText("Your message has been sent successfully. Thank you for contacting BlogHub!")).toBeVisible();
  for (const label of ["Name (required)", "Email (required)", "Subject (required)", "Message (required)"])
    await expect(form.getByLabel(label, { exact: true })).toHaveValue("");
  await expect(page.locator("body")).toHaveAttribute("data-captcha-resets", "1");
  await fillContact(page);
  await form.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(form.getByText("Please complete the CAPTCHA verification.", { exact: true })).toBeVisible();
  expect(calls).toBe(1);
  expect(await page.evaluate(() => Object.values(localStorage).some(value => String(value).includes("test-token-")))).toBe(false);
});

test("contact failures preserve input, reset tokens and show safe field and CAPTCHA feedback without retrying", async ({ page }) => {
  let calls = 0;
  const failures = [
    { status: 400, message: "Invalid or expired captcha token" },
    { status: 400, message: "email must be an email" },
    { status: 503, message: "SMTP secret and internal stack trace must never be displayed" },
  ];
  await page.route(`${api}/contact`, route => {
    const failure = failures[calls++];
    return failure ? route.fulfill({ status: failure.status, json: { message: failure.message } }) : route.abort("failed");
  });
  await page.goto("/contact");
  const form = await fillContact(page);
  for (const message of ["CAPTCHA verification failed. Please complete the verification again.", "Please check your email.", "We couldn't send your message right now. Please try again later.", "We couldn't send your message right now. Please try again later."]) {
    await page.getByRole("button", { name: "Complete test CAPTCHA" }).click();
    await form.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(form.getByText(message, { exact: true })).toBeVisible();
    await expect(form.getByLabel("Subject (required)", { exact: true })).toHaveValue("  Technical Issue  ");
    await expect(form.getByLabel("Message (required)", { exact: true })).toHaveValue("  I cannot publish my blog post.  ");
    await expect(form.getByRole("button", { name: "Send message", exact: true })).toBeEnabled();
  }
  expect(calls).toBe(4);
  await expect(form.getByText(/SMTP secret/)).toHaveCount(0);
  await form.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(form.getByText("Please complete the CAPTCHA verification.", { exact: true })).toBeVisible();
  expect(calls).toBe(4);
  await page.evaluate(() => window.dispatchEvent(new Event("captcha-error")));
  await expect(form.getByText("Verification is unavailable. Check your connection and try again.")).toBeVisible();
});

test("contact respects numeric and date Retry-After headers and never retries on its own", async ({ page }) => {
  let calls = 0;
  await page.route(`${api}/contact`, route => {
    calls++;
    return route.fulfill({ status: 429, headers: { "Access-Control-Expose-Headers": "Retry-After", "Retry-After": calls === 1 ? "2" : new Date(Date.now() + 3000).toUTCString() }, json: { message: "ThrottlerException" } });
  });
  await page.goto("/contact");
  const form = await fillContact(page);
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.getByRole("button", { name: "Complete test CAPTCHA" }).click();
    await form.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(form.getByText("Too many requests. Please try again later.", { exact: true })).toBeVisible();
    await expect(form.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
    await expect(form.getByText(/Please wait \d+ seconds/)).toBeVisible();
    await expect(form.getByRole("button", { name: "Send message", exact: true })).toBeEnabled();
    expect(calls).toBe(attempt);
  }
});

test("contact prefills editable account details, fits both themes and loads CAPTCHA once across navigation", async ({ page }) => {
  const loads = await mockCaptcha(page);
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("author@test.local");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("link", { name: "Contact Us", exact: true }).click();
  await expect(page).toHaveURL(/\/contact$/);
  const form = page.getByRole("form", { name: "Contact us", exact: true });
  await expect(form.getByLabel("Name (required)", { exact: true })).toHaveValue("Alex Writer");
  await expect(form.getByLabel("Email (required)", { exact: true })).toHaveValue("author@test.local");
  await form.getByLabel("Name (required)", { exact: true }).fill("A different name");
  for (const width of [375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await expect(page.locator(`[data-captcha-theme="${theme}"]`)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`contact-${width}-${theme}.png`), fullPage: true });
    }
  }
  await expect(form.getByLabel("Name (required)", { exact: true })).toHaveValue("A different name");
  await page.getByRole("link", { name: "BlogHub home", exact: true }).click();
  await page.locator(".site-footer").scrollIntoViewIfNeeded();
  await page.getByRole("link", { name: "Contact Us", exact: true }).click();
  await expect(page.getByRole("button", { name: "Complete test CAPTCHA" })).toBeVisible();
  expect(loads()).toBe(1);
  await page.route(`${api}/contact`, route => route.fulfill({ status: 200, json: { message: "Accepted" } }));
  await fillContact(page);
  await page.getByRole("button", { name: "Complete test CAPTCHA" }).click();
  await form.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(form.getByText("Your message has been sent successfully. Thank you for contacting BlogHub!")).toBeVisible();
  const profiles = async () => ((await (await page.request.get(`${api}/__requests`)).json()) as { path: string }[]).filter(item => item.path === "/api/v1/auth/me").length;
  const previous = await profiles();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(profiles).toBeGreaterThan(previous);
  await expect(form.getByLabel("Name (required)", { exact: true })).toHaveValue("");
  await expect(form.getByLabel("Email (required)", { exact: true })).toHaveValue("");
});

test("contact handles script loading failure without a CAPTCHA bypass", async ({ page }) => {
  await page.route("https://www.google.com/recaptcha/api.js?**", route => route.abort("failed"));
  let calls = 0;
  await page.route(`${api}/contact`, route => { calls++; return route.fulfill({ status: 200, json: { message: "Accepted" } }); });
  await page.goto("/contact");
  const form = await fillContact(page);
  await expect(form.getByText("Verification could not load. Check your connection and reload this page.")).toBeVisible();
  await form.getByRole("button", { name: "Send message", exact: true }).click();
  expect(calls).toBe(0);
});

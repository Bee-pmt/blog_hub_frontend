import { test, expect, Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
const api = "http://localhost:5301/api/v1";
async function googleHandoff(page: Page, idToken: string, mode = "login") {
  const token = await encode({ secret: "playwright-only-google-oauth-secret-32-bytes", salt: "bloghub_google", maxAge: 600, token: { googleIdToken: idToken, googleExpiresAt: Date.now() + 600_000 } });
  await page.context().addCookies([
    { name: "bloghub_google", value: token, url: "http://localhost:3001", httpOnly: true, sameSite: "Lax" },
    { name: "bloghub_oauth_intent", value: JSON.stringify({ mode, returnTo: "/dashboard" }), url: "http://localhost:3001", httpOnly: true, sameSite: "Lax" },
  ]);
  await page.goto("/auth/google");
}

test("new Google users set a password before creation and can later use password login", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with Google", exact: true })).toBeVisible();
  await googleHandoff(page, "google-new");
  await expect(page.getByRole("heading", { name: "Complete your account." })).toBeVisible();
  await page.getByLabel("Create password", { exact: true }).fill("password123");
  await page.getByLabel("Confirm password", { exact: true }).fill("different123");
  await page.getByRole("button", { name: "Create account and sign in" }).click();
  await expect(page.locator("main [role=alert]")).toHaveText("Passwords do not match.");
  await page.getByLabel("Confirm password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Create account and sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Google Writer", exact: true })).toBeVisible();
  expect((await page.context().cookies()).some(cookie => cookie.name === "bloghub_google")).toBe(false);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, "google-new@test.local");
});

test("existing users confirm their password once and later Google sign-ins need no password", async ({ page }) => {
  await googleHandoff(page, "google-author");
  await page.getByLabel("Current BlogHub password").fill("incorrect");
  await page.getByRole("button", { name: "Confirm password and link Google" }).click();
  await expect(page.locator("main [role=alert]")).toHaveText("Invalid email or password");
  await page.getByLabel("Current BlogHub password").fill("password123");
  await page.getByRole("button", { name: "Confirm password and link Google" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await googleHandoff(page, "google-author");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Sign in with Google", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("settings link requires the current password and preserves the signed-in account", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Link Google", exact: true })).toBeVisible();
  await googleHandoff(page, "google-other", "link");
  await page.getByLabel("Current BlogHub password").fill("password123");
  await page.getByRole("button", { name: "Confirm password and link Google" }).click();
  await expect(page.locator("main [role=alert]")).toHaveText("Google email must match your current account email");
  await googleHandoff(page, "google-author", "link");
  await page.getByLabel("Current BlogHub password").fill("password123");
  await page.getByRole("button", { name: "Confirm password and link Google" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText("Google is linked. You can sign in with Google or your password.")).toBeVisible();
});

test("Google completion rejects a forged handoff cookie", async ({ page }) => {
  await page.context().addCookies([{ name: "bloghub_google", value: "forged", url: "http://localhost:3001" }]);
  await page.goto("/auth/google");
  await expect(page.getByRole("heading", { name: "Unable to continue with Google" })).toBeVisible();
  await expect(page.locator("main [role=alert]")).toContainText("expired");
});
test.beforeEach(async ({ request, page, context }) => {
  await request.post(`${api}/__reset`);
  // Isolate the real Next cache through authorized writes to disposable fixture data.
  await login(page, "admin@test.local");
  await page.goto("/dashboard/taxonomy");
  const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "New category", exact: true }) });
  await form.getByRole("textbox", { name: "Name", exact: true }).fill("Cache reset");
  await form.getByRole("button", { name: "Create category", exact: true }).click();
  await page.locator(".taxonomy-row").filter({ hasText: "/cache-reset" }).getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await context.clearCookies();
  await page.goto("/login");
});
async function login(page: Page, email = "author@test.local") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: "Signed in successfully." })).toBeVisible();
}
test("published stories, combined URL filters, pagination and safe article", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("12 stories", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("journal.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(
    page.getByRole("heading", { name: "Thoughtful story 10", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search stories").fill("story 1");
  await page.getByLabel("Author", { exact: true }).fill("Alex");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=story\+1/);
  await expect(page.getByText("2 stories", { exact: true }).filter({ visible: true })).toBeVisible();
  await page
    .getByRole("link", { name: "Thoughtful story 1", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A fresh perspective", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".prose script")).toHaveCount(0);
});
test("register, sign in, reload session and sign out", async ({ page }) => {
  const browserAuthRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/auth\/(login|register|refresh|logout)$/.test(request.url())) {
      browserAuthRequests.push(request.url());
    }
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await page.getByRole("link", { name: "Create an account", exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByLabel("Display name", { exact: true }).fill("New Writer");
  const registrationForm = page.locator(".account-card:visible");
  await registrationForm.getByLabel("Email", { exact: true }).fill("new@test.local");
  await registrationForm.getByLabel("Password", { exact: true }).fill("password123");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "You’re ready to write." }),
  ).toBeVisible();
  await expect(page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: "Your account has been created." })).toBeVisible();
  await login(page, "new@test.local");
  const refreshCookie = (await page.context().cookies()).find((cookie) => cookie.name === "bloghub_refresh");
  expect(refreshCookie).toMatchObject({ httpOnly: true, path: "/", sameSite: "Lax" });
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toHaveText("N");
  await expect(page.locator(".site-header").getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  await expect(page.locator(".dashboard-sidebar").getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "New Writer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  const signOutToast = page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: "Signed out successfully." });
  await expect(signOutToast).toBeVisible();
  await signOutToast.getByRole("button", { name: "Close toast", exact: true }).click();
  await expect(signOutToast).toHaveCount(0);
  expect(browserAuthRequests).toEqual([]);
  expect((await page.context().cookies()).some((cookie) => cookie.name === "bloghub_refresh")).toBe(false);
});
test("create draft, reopen unchanged Markdown, publish and unpublish", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Write a story", exact: true }).click();
  await page.getByLabel("Story title", { exact: true }).fill("A new chapter");
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("cat-1");
  await page
    .getByRole("button", { name: "Markdown source", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Story content", exact: true })
    .fill("## A heading\n\n**Keep this Markdown**");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/posts\/[^/]+\/edit$/);
  await page
    .getByRole("button", { name: "Markdown source", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Story content", exact: true }),
  ).toHaveValue("## A heading\n\n**Keep this Markdown**");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByText("Your story is published.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Read story", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "A new chapter", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: "Draft saved." })).toBeVisible();
});
test("failed save retains content and offers browser recovery after reload", async ({
  page,
  request,
}) => {
  await login(page);
  await page.goto("/dashboard/posts/draft-1/edit");
  await page
    .getByRole("button", { name: "Markdown source", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Story content", exact: true })
    .fill("Writing that must survive");
  await request.post(`${api}/__fail-save`);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Temporary save failure" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Story content", exact: true }),
  ).toHaveValue("Writing that must survive");
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(
    page.getByText("Unsaved writing found.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore writing", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Markdown source", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Story content", exact: true }),
  ).toHaveValue("Writing that must survive");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: "Draft saved." })).toBeVisible();
});
test("author taxonomy permissions and blocked admin route", async ({
  page, request,
}) => {
  await login(page);
  await page.goto("/dashboard/taxonomy");
  await expect(
    page.getByRole("button", { name: "Edit Ideas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Life", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".taxonomy-row").filter({ hasText: "/life" })).toHaveCount(0);
  await expect(page.locator(".taxonomy-row").filter({ hasText: "/perspective" })).toHaveCount(0);
  const ideasToggle = page.getByRole("button", { name: "Tags for Ideas", exact: true });
  await expect(ideasToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Edit Thinking", exact: true })).toBeHidden();
  await ideasToggle.click();
  await expect(ideasToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Edit Thinking", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Perspective", exact: true })).toHaveCount(0);
  await ideasToggle.press("Enter");
  await expect(ideasToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Edit Thinking", exact: true })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Categories (1)", exact: true })).toBeVisible();
  const categorySelect = page.getByRole("combobox", { name: "Category", exact: true });
  await expect(categorySelect.locator("option")).toHaveText(["Select a category", "Ideas", "Life"]);
  await expect(
    page.getByRole("button", { name: "Delete", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".taxonomy-row input")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Ideas", exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit category", exact: true });
  await expect(editDialog.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Ideas");
  await expect(editDialog.getByRole("textbox", { name: "Name", exact: true })).toBeFocused();
  await editDialog.getByRole("textbox", { name: "Name", exact: true }).fill("Cancelled edit");
  await editDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editDialog).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Ideas", exact: true }).click();
  await expect(editDialog.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Ideas");
  await editDialog.getByRole("textbox", { name: "Name", exact: true }).fill("Life");
  await request.post(`${api}/__fail-request`, { data: {
    path: "/categories/cat-1", method: "PATCH", status: 409, message: "Name already exists",
  } });
  await editDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editDialog.getByRole("alert")).toHaveText("Name already exists");
  await expect(editDialog.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Life");
  await editDialog.getByRole("textbox", { name: "Name", exact: true }).fill("Fresh Ideas");
  await editDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editDialog).toHaveCount(0);
  await expect(page.getByText("/fresh-ideas", { exact: true })).toBeVisible();
  await expect(categorySelect.locator("option")).toHaveText(["Select a category", "Fresh Ideas", "Life"]);
  await expect(page.locator(".taxonomy-row").filter({ hasText: "/life" })).toHaveCount(0);
  await expect(page.locator(".taxonomy-row").filter({ hasText: "/perspective" })).toHaveCount(0);
  const tagForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "New tag", exact: true }) });
  await categorySelect.selectOption("cat-2");
  await tagForm.getByRole("textbox", { name: "Name", exact: true }).fill("Daily moments");
  await tagForm.getByRole("button", { name: "Create tag", exact: true }).click();
  await page.getByRole("button", { name: "Tags for Life", exact: true }).click();
  const newTag = page.locator(".taxonomy-tags .taxonomy-row").filter({ hasText: "/daily-moments" });
  await expect(newTag).toContainText("Life");
  await expect(newTag.getByRole("button", { name: "Edit Daily moments", exact: true })).toBeVisible();
  await newTag.getByRole("button", { name: "Edit Daily moments", exact: true }).click();
  const tagDialog = page.getByRole("dialog", { name: "Edit tag", exact: true });
  await expect(tagDialog.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Daily moments");
  await tagDialog.getByRole("textbox", { name: "Name", exact: true }).press("Escape");
  await expect(tagDialog).toHaveCount(0);
  await newTag.getByRole("button", { name: "Edit Daily moments", exact: true }).click();
  await tagDialog.getByRole("textbox", { name: "Name", exact: true }).fill("Everyday moments");
  await tagDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(tagDialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Everyday moments", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Categories (2)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Life", exact: true })).toHaveCount(0);
  await page.goto("/dashboard/admin/posts");
  await expect(
    page.getByRole("heading", { name: "This workspace is for admins." }),
  ).toBeVisible();
});
test("author without categories can create a tag under an existing category", async ({ page, request }) => {
  const registration = await request.post(`${api}/auth/register`, {
    data: { displayName: "New Author", email: "new-author@test.local", password: "password123" },
  });
  expect(registration.ok()).toBe(true);
  await login(page, "new-author@test.local");
  await page.goto("/dashboard/taxonomy");
  await expect(page.getByRole("heading", { name: "Categories (0)", exact: true })).toBeVisible();
  const tagForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "New tag", exact: true }) });
  await expect(tagForm.getByRole("button", { name: "Create tag", exact: true })).toBeEnabled();
  await tagForm.getByRole("combobox", { name: "Category", exact: true }).selectOption("cat-1");
  await tagForm.getByRole("textbox", { name: "Name", exact: true }).fill("New perspective");
  await tagForm.getByRole("button", { name: "Create tag", exact: true }).click();
  await page.getByRole("button", { name: "Tags for Ideas", exact: true }).click();
  const newTag = page.locator(".taxonomy-tags .taxonomy-row").filter({ hasText: "/new-perspective" });
  await expect(newTag).toContainText("Ideas");
  await expect(newTag.getByRole("button", { name: "Edit New perspective", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Categories (1)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Ideas", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Thinking", exact: true })).toHaveCount(0);
});
test("admin moderates another author and deletes a category without deleting stories", async ({
  page,
}) => {
  await login(page, "admin@test.local");
  await page.goto("/dashboard/admin/posts/story-2/edit");
  await expect(page).toHaveURL(/\/dashboard\/admin\/posts$/);
  await expect(page.getByRole("heading", { name: "All stories", exact: true })).toBeVisible();
  await expect(page.locator('.manage-list a[href$="/edit"]')).toHaveCount(0);
  const otherStory = page.locator(".manage-row").filter({ has: page.getByRole("heading", { name: "Thoughtful story 2", exact: true }) });
  await expect(otherStory.getByRole("link", { name: "Read", exact: true })).toBeVisible();
  await expect(otherStory.getByRole("button", { name: "Unpublish", exact: true })).toBeVisible();
  await expect(otherStory.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await page.goto("/dashboard/taxonomy");
  await expect(page.getByRole("button", { name: "Edit Life", exact: true })).toBeVisible();
  const adminIdeasToggle = page.getByRole("button", { name: "Tags for Ideas", exact: true });
  await adminIdeasToggle.click();
  await expect(page.getByRole("button", { name: "Edit Thinking", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Perspective", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Categories (2)", exact: true })).toBeVisible();
  await adminIdeasToggle.click();
  await page.getByRole("button", { name: "Tags for Life", exact: true }).click();
  await expect(page.getByText("No tags in this category yet.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tags for Life", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Category", exact: true }).locator("option"))
    .toHaveText(["Select a category", "Ideas", "Life"]);
  await page
    .locator(".taxonomy-row")
    .filter({ hasText: "/ideas" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Stories are preserved and become Uncategorized",
  );
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(
    page.getByText("Deleted successfully.", { exact: true }),
  ).toBeVisible();
  await page.goto("/blogs/thoughtful-story-2");
  await expect(page.locator(".article-header .eyebrow")).toHaveText("Uncategorized");
});
test("admin unpublishes another author's story and controls republication", async ({ page, browser, request }) => {
  await login(page, "admin@test.local");
  // Prime the public article cache before moderation.
  await page.goto("/blogs/thoughtful-story-1");
  await expect(page.getByRole("heading", { name: "Thoughtful story 1", exact: true })).toBeVisible();
  await page.goto("/dashboard/admin/posts");
  const story = page.locator(".manage-row").filter({ has: page.getByRole("heading", { name: "Thoughtful story 1", exact: true }) });
  await request.post(`${api}/__fail-request`, { data: {
    path: "/admin/blogs/story-1/status", method: "PATCH", status: 503, message: "Moderation temporarily unavailable",
  } });
  await story.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Moderation temporarily unavailable" })).toBeVisible();
  await expect(story.getByRole("button", { name: "Unpublish", exact: true })).toBeEnabled();
  await story.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(story.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
  expect((await request.get(`${api}/blogs/thoughtful-story-1`)).status()).toBe(404);
  const journal = await (await request.get(`${api}/blogs?limit=50`)).json();
  expect(journal.items.some((item: { id: string }) => item.id === "story-1")).toBe(false);

  const authorContext = await browser.newContext({ baseURL: "http://localhost:3001" });
  try {
    const authorPage = await authorContext.newPage();
    await login(authorPage);
    const ownStory = authorPage.locator(".manage-row").filter({ has: authorPage.getByRole("heading", { name: "Thoughtful story 1", exact: true }) });
    await expect(ownStory.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
    await authorPage.goto("/dashboard/posts/story-1/edit");
    await expect(authorPage.getByText("Unpublished by an admin. You can edit and save this draft, but only an admin can publish it again.", { exact: true })).toBeVisible();
    await expect(authorPage.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
    await authorPage.getByLabel("Story title", { exact: true }).fill("Updated moderated story");
    await authorPage.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(authorPage.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: "Draft saved." })).toBeVisible();
    await expect(authorPage.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
    const authorLogin = await request.post(`${api}/auth/login`, { data: { email: "author@test.local", password: "password123" } });
    const { accessToken } = await authorLogin.json();
    const headers = { Authorization: `Bearer ${accessToken}` };
    expect((await request.patch(`${api}/admin/blogs/story-1/status`, { headers, data: { status: "published" } })).status()).toBe(403);
    expect((await request.patch(`${api}/blogs/story-1`, { headers, data: { status: "published" } })).status()).toBe(403);

    await page.reload();
    const updatedStory = page.locator(".manage-row").filter({ hasText: "Updated moderated story" });
    await updatedStory.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(updatedStory.getByRole("button", { name: "Unpublish", exact: true })).toBeEnabled();
    const published = await (await request.get(`${api}/blogs/thoughtful-story-1`)).json();
    expect(published).toMatchObject({ title: "Updated moderated story", status: "published", publicationBlocked: false });
    await authorPage.reload();
    await expect(authorPage.getByRole("button", { name: "Unpublish", exact: true })).toBeEnabled();
  } finally {
    await authorContext.close();
  }
});

test("mobile layout, dark theme and keyboard accessible controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("12 stories", { exact: true }).filter({ visible: true })).toBeVisible();
  const themeSwitch = page.getByRole("switch", { name: "Dark mode" });
  await expect(themeSwitch).toHaveAttribute("aria-checked", "false");
  await themeSwitch.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(themeSwitch).toHaveAttribute("aria-checked", "true");
  await themeSwitch.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await themeSwitch.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".site-nav > :last-child")).toHaveAttribute("role", "switch");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  await page.screenshot({
    path: test.info().outputPath("mobile-dark.png"),
    fullPage: true,
  });
});

test("expired access refreshes and visual metadata edits preserve original Markdown", async ({
  page,
  request,
}) => {
  await login(page);
  await request.post(`${api}/__expire-access`);
  await page.goto("/dashboard/posts/draft-1/edit");
  await expect(
    page.getByRole("button", { name: "Visual", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Story title", { exact: true }).fill("A renamed draft");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: "Draft saved." })).toBeVisible();
  await page
    .getByRole("button", { name: "Markdown source", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Story content", exact: true }),
  ).toHaveValue("Untouched __Markdown__");
  await page.screenshot({
    path: test.info().outputPath("editor.png"),
    fullPage: true,
  });
});

test("post deletion requires confirmation and removes the story", async ({
  page,
}) => {
  await login(page);
  await page.goto("/dashboard/posts/draft-1/edit");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit your story", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Private draft", exact: true }),
  ).toHaveCount(0);
});

test("device cover upload, replacement, failed save, publication and removal", async ({ page, request }) => {
  const image = {
    name: "cover.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64"),
  };
  await login(page);
  await page.goto("/dashboard/posts/new");
  await page.getByLabel("Story title", { exact: true }).fill("A story with a device photo");
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption("cat-1");
  await page.getByRole("button", { name: "Markdown source", exact: true }).click();
  await page.getByRole("textbox", { name: "Story content", exact: true }).fill("## A photographed story");
  const picker = page.locator('input[type="file"]:visible');
  await picker.setInputFiles({ name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.locator('.notice[role="alert"]')).toHaveText("Choose a JPEG, PNG, or WebP image.");
  await picker.setInputFiles({ ...image, buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(page.locator('.notice[role="alert"]')).toHaveText("Choose a non-empty image of up to 5 MB.");
  await picker.setInputFiles(image);
  await expect(page.getByRole("img", { name: "Selected cover preview" })).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/posts\/[^/]+\/edit$/);
  const token = (await (await request.post(`${api}/auth/login`, { data: { email: "author@test.local", password: "password123" } })).json()).accessToken;
  const headers = { Authorization: `Bearer ${token}` };
  const first = await (await request.get(`${api}/me/blogs/${page.url().split("/").at(-2)}`, { headers })).json();
  const log = await (await request.get(`${api}/__requests`)).json();
  expect(log.findLast((entry: { path: string; method: string }) => entry.path === "/api/v1/blogs" && entry.method === "POST").contentType).toContain("multipart/form-data; boundary=");
  expect(first.coverImageUrl).toMatch(/^\/images\/.+\.png$/);
  await expect(page).toHaveURL(/\/posts\/[^/]+\/edit$/);
  await expect(page.getByRole("img", { name: "Story cover", exact: true })).toHaveAttribute("src", `http://localhost:5301${first.coverImageUrl}`);
  await picker.setInputFiles({ ...image, name: "replacement.png" });
  await request.post(`${api}/__fail-save`);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator('.notice[role="alert"]')).toHaveText("Temporary save failure");
  await expect(page.locator('[data-sonner-toast][data-type="error"]').filter({ hasText: "Temporary save failure" })).toBeVisible();
  await expect(page.getByText("Selected: replacement.png", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
  const replacement = await (await request.get(`${api}/me/blogs/${first.id}`, { headers })).json();
  expect(replacement.coverImageUrl).not.toBe(first.coverImageUrl);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Your story is published.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Read story", exact: false }).click();
  const publicCover = page.locator(".article-cover");
  await expect(publicCover).toHaveAttribute("src", `http://localhost:5301${replacement.coverImageUrl}`);
  await expect.poll(() => publicCover.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.goto(`/dashboard/posts/${first.id}/edit`);
  await page.getByRole("button", { name: "Remove cover image", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Your story is published.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("img", { name: "Story cover", exact: true })).toHaveCount(0);
});


test("settings changes passwords, preserves incorrect-password sessions, and signs out other tabs", async ({ page, context }) => {
  await login(page);
  const otherTab = await context.newPage();
  await otherTab.goto("/dashboard");
  await expect(otherTab.getByRole("link", { name: "Account settings" })).toBeVisible();
  await page.getByRole("link", { name: "Account settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.screenshot({ path: test.info().outputPath("password-settings.png"), fullPage: true });
  await page.getByLabel("Current password", { exact: true }).fill("wrongpassword");
  await page.getByLabel("New password", { exact: true }).fill("newpassword123");
  await page.getByLabel("Confirm new password", { exact: true }).fill("different123");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.locator(".account-card:visible").getByRole("alert")).toHaveText("Passwords do not match.");
  await page.getByLabel("Confirm new password", { exact: true }).fill("newpassword123");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.locator(".account-card:visible").getByRole("alert")).toHaveText("Current password is incorrect");
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
  await page.getByLabel("Current password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(otherTab).toHaveURL(/\/login/);
  expect((await context.cookies()).some((cookie) => cookie.name === "bloghub_refresh")).toBe(false);
  await page.locator(".account-card:visible").getByLabel("Email", { exact: true }).fill("author@test.local");
  await page.locator(".account-card:visible").getByLabel("Password", { exact: true }).fill("newpassword123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("forgot password verifies the emailed code and accepts the new password", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.locator(".account-card:visible").getByLabel("Email", { exact: true }).fill("author@test.local");
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page.getByRole("heading", { name: "Reset password", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath("password-recovery-mobile.png"), fullPage: true });
  await page.getByLabel("Verification code").fill("999999");
  await page.getByLabel("New password", { exact: true }).fill("resetpassword123");
  await page.getByLabel("Confirm new password", { exact: true }).fill("resetpassword123");
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.locator(".account-card:visible").getByRole("alert")).toHaveText("Invalid or expired reset code");
  await page.getByLabel("Verification code").fill("012345");
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.locator(".account-card:visible").getByLabel("Email", { exact: true }).fill("author@test.local");
  await page.locator(".account-card:visible").getByLabel("Password", { exact: true }).fill("resetpassword123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});


test("admin user management searches, paginates, confirms role changes and manages access", async ({ page }) => {
  await login(page, "admin@test.local");
  await page.getByRole("link", { name: "Users · Admin", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/admin\/users$/);
  const table = page.locator(".user-table:visible");
  await expect(table.locator("tbody tr")).toHaveCount(10);
  await expect(page.getByText("15 users · 10 per page", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(5);
  await expect(page.getByRole("navigation", { name: "User pages" }).getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await page.getByLabel("Search users", { exact: true }).fill("author@test.local");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "User pages" }).getByText("Page 1 of 1", { exact: true })).toBeVisible();
  await page.getByLabel("Role for author@test.local").selectOption("admin");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Role for author@test.local")).toHaveValue("author");
  await page.getByLabel("Role for author@test.local").selectOption("admin");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByLabel("Role for author@test.local")).toHaveValue("admin");
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(table.getByText("Inactive", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reactivate", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(table.getByText("Active", { exact: true })).toBeVisible();
  await page.getByLabel("Search users", { exact: true }).fill("no-such-account");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No users found." })).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(10);
  const self = table.getByRole("row").filter({ hasText: "admin@test.local" });
  await expect(self.getByRole("button", { name: "Deactivate" })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath("admin-users.png"), fullPage: true });
});

test("authors cannot access user management", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("link", { name: "Users · Admin", exact: true })).toHaveCount(0);
  await page.goto("/dashboard/admin/users");
  await expect(page.getByRole("heading", { name: "This workspace is for admins." })).toBeVisible();
  await expect(page.locator(".user-table:visible")).toHaveCount(0);
});


test("public reads reuse Next cache and taxonomy writes invalidate it", async ({ page, request }) => {
  const url = "/?q=Thoughtful&category=ideas&page=1";
  const reads = async () => (await (await request.get(`${api}/__requests`)).json()) as { path: string; method: string }[];
  await page.goto(url);
  await expect(page.getByText("12 stories", { exact: true }).filter({ visible: true })).toBeVisible();
  const first = await reads();
  await page.reload();
  await expect(page.getByText("12 stories", { exact: true }).filter({ visible: true })).toBeVisible();
  const second = await reads();
  const count = (log: typeof first, path: string) => log.filter((entry) => entry.method === "GET" && entry.path === path).length;
  const listPath = "/api/v1/blogs?q=Thoughtful&category=ideas&page=1&limit=9";
  expect(count(first, listPath)).toBeGreaterThan(0);
  expect(count(second, listPath)).toBe(count(first, listPath));
  expect(count(second, "/api/v1/categories")).toBe(count(first, "/api/v1/categories"));
  await login(page);
  await page.goto("/dashboard/taxonomy");
  await page.getByRole("button", { name: "Edit Ideas", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit category", exact: true });
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Updated Ideas");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto(url);
  await expect(page.getByRole("link", { name: "Updated Ideas", exact: true }).first()).toBeVisible();
  await expect(page.getByText("0 stories", { exact: true }).filter({ visible: true })).toBeVisible();
  const third = await reads();
  expect(count(third, listPath)).toBeGreaterThan(count(second, listPath));
  expect(count(third, "/api/v1/categories")).toBeGreaterThan(count(second, "/api/v1/categories"));
});

test("RTK Query reuses dashboard lists, details, and taxonomy during navigation", async ({ page, request }) => {
  const requests: { url: string; action: boolean }[] = [];
  page.on("request", (request) => requests.push({
    url: request.url(), action: !!request.headers()["next-action"],
  }));
  await login(page);
  const story = page.getByRole("link", { name: "Thoughtful story 1", exact: true });
  await expect(story).toBeVisible();
  const listReads = () => requests.filter((entry) => entry.url.includes(`${api}/me/blogs?`)).length;
  const initialReads = listReads();
  await page.getByRole("link", { name: "Categories & tags", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit Ideas", exact: true })).toBeVisible();
  const taxonomyActions = requests.filter((entry) => entry.action).length;
  await page.getByRole("link", { name: "Write a story", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Story title", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Category", exact: true }).locator("option")).toHaveText(["Select a category", "Ideas", "Life"]);
  expect(requests.filter((entry) => entry.action)).toHaveLength(taxonomyActions);
  await page.getByRole("link", { name: "My stories", exact: true }).click();
  await expect(story).toBeVisible();
  expect(listReads()).toBe(initialReads);
  await story.click();
  await expect(page.getByRole("textbox", { name: "Story title", exact: true })).toHaveValue("Thoughtful story 1");
  const detailReads = () => requests.filter((entry) => entry.url === `${api}/me/blogs/story-1`).length;
  expect(detailReads()).toBe(1);
  await page.getByRole("link", { name: "My stories", exact: true }).click();
  await story.click();
  await expect(page.getByRole("textbox", { name: "Story title", exact: true })).toHaveValue("Thoughtful story 1");
  expect(detailReads()).toBe(1);
  await page.getByRole("textbox", { name: "Story title", exact: true }).fill("Updated through RTK Query");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Your story is published.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "My stories", exact: true }).click();
  await expect(page.getByRole("link", { name: "Updated through RTK Query", exact: true })).toBeVisible();
  expect(listReads()).toBeGreaterThan(initialReads);
  // The shared taxonomy write also invalidates already loaded blog labels.
  await page.getByRole("link", { name: "Categories & tags", exact: true }).click();
  await page.getByRole("button", { name: "Edit Ideas", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit category", exact: true });
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Shared Ideas");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("link", { name: "My stories", exact: true }).click();
  await expect(page.locator(".manage-row:visible").filter({ has: page.getByRole("link", { name: "Updated through RTK Query", exact: true }) })).toContainText("Shared Ideas");
  const log = await (await request.get(`${api}/__requests`)).json();
  expect(log.some((entry: { method: string; path: string }) => entry.method === "PATCH" && entry.path === "/api/v1/categories/cat-1")).toBe(true);
});

test("activity paginates, shows changes safely, and retains a deleted story snapshot", async ({ page, request }) => {
  const post = await (await request.get(`${api}/blogs/thoughtful-story-1`)).json();
  const items = Array.from({ length: 12 }, (_, index) => ({
    id: `audit-${index}`, blogId: post.id, blogTitle: `Edited story ${index}`, actorId: "author", postAuthorId: "author", action: "updated",
    createdAt: new Date(Date.UTC(2026, 9, 20, 12, 0, 0) - index * 1000).toISOString(),
    changes: { title: { old: `Old title ${index}`, new: `Edited story ${index}` } }, snapshot: null,
  }));
  const fixtureItems = [
    { ...items[0], changes: { title: { old: "Original title", new: "Edited story 0" }, content: { old: "Original content", new: '<script>alert("unsafe")</script>' }, category: { old: null, new: { id: "cat-1", name: "Ideas", slug: "ideas" } }, tags: { old: [], new: [{ id: "tag-1", name: "Thinking", slug: "thinking", categoryId: "cat-1" }] }, publicationBlocked: { old: false, new: true } } },
    { ...items[1], blogTitle: "Deleted story", action: "deleted", changes: {}, snapshot: { ...post, authorId: "author", title: "Deleted story", content: '# Retained draft\n\nHistorical content.\n\n<script>alert("unsafe")</script>' } },
    ...items.slice(2),
    { ...items[0], id: "audit-admin", actorId: "admin", action: "unpublished", blogTitle: "Admin moderation" },
  ];
  await request.post(`${api}/__audit-fixtures`, { data: { items: fixtureItems } });
  await login(page);
  await page.getByRole("link", { name: "My activity", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My activity", exact: true })).toBeVisible();
  await expect(page.getByText("12 actions · 10 per page")).toBeVisible();
  await expect(page.locator(".manage-row:visible")).toHaveCount(10);
  await expect(page.getByText("Admin moderation", { exact: true })).toHaveCount(0);
  const openFirst = page.getByRole("button", { name: "View details for Edited story 0", exact: true });
  await openFirst.click();
  const dialog = page.getByRole("dialog", { name: "Activity details" });
  await expect(dialog.getByText("Original title", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Thinking", { exact: true })).toBeVisible();
  await expect(dialog.getByText('<script>alert("unsafe")</script>', { exact: true })).toBeVisible();
  await expect(dialog.locator("script")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(openFirst).toBeFocused();
  await page.getByRole("button", { name: "View details for Deleted story", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Retained draft" })).toBeVisible();
  await expect(dialog.getByText("Historical content.", { exact: true })).toBeVisible();
  await expect(dialog.locator("script")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("navigation", { name: "Activity pages" }).getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(page.locator(".manage-row:visible")).toHaveCount(2);
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "View details for Edited story 0", exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("activity-mobile.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, "admin@test.local");
  await page.getByRole("link", { name: "My activity", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Admin moderation", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Edited story 0", exact: true })).toHaveCount(0);
});

test("activity handles empty history, list errors, and missing detail records", async ({ page, request }) => {
  await login(page);
  await request.post(`${api}/__fail-request`, { data: { path: "/me/blog-audit-logs", method: "GET", message: "Activity temporarily unavailable", status: 503 } });
  await page.getByRole("link", { name: "My activity", exact: true }).click();
  await expect(page.locator("main [role=alert]")).toContainText("Activity temporarily unavailable");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No activity yet.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await request.post(`${api}/__audit-fixtures`, { data: { items: [{ id: "gone", blogId: "story-1", blogTitle: "Unavailable record", actorId: "author", postAuthorId: "author", action: "updated", createdAt: "2026-10-20T12:00:00.000Z", changes: {}, snapshot: null }] } });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Unavailable record", exact: true })).toBeVisible();
  await request.post(`${api}/__fail-request`, { data: { path: "/me/blog-audit-logs/gone", method: "GET", message: "Audit log not found", status: 404 } });
  await page.getByRole("button", { name: "View details for Unavailable record", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Activity details" });
  await expect(dialog.getByRole("alert")).toContainText("Audit log not found");
  await dialog.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Unavailable record", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("RTK Query clears private lists when signing out and switching accounts", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("link", { name: "Thoughtful story 1", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Thoughtful story 1", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Story title", exact: true })).toHaveValue("Thoughtful story 1");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("other@test.local");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Other Writer", exact: true })).toBeVisible();
  // Sign-in returns to the old editor URL; it must not reuse the previous owner's detail.
  await expect(page.getByRole("heading", { name: "Unable to open this story.", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "My stories", exact: true }).click();
  await expect(page.getByRole("link", { name: "Thoughtful story 2", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Thoughtful story 1", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Categories & tags", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit Life", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Ideas", exact: true })).toHaveCount(0);
});

test("notifications show relative times, paginate, mark read, and keep recipients separate", async ({ page, request }) => {
  const items = Array.from({ length: 12 }, (_, index) => ({
    id: `notice-${index}`, userId: "author", type: index === 0 ? "post_unpublished" : "post_deleted",
    blogId: "story-1", blogTitle: `Moderated story ${index}`,
    message: index === 0 ? 'An admin unpublished your post "Thoughtful story 1".' : `An admin deleted your post "Story ${index}".`,
    readAt: null, createdAt: new Date(Date.now() - (index + 1) * 60_000).toISOString(),
  }));
  await request.post(`${api}/__notification-fixtures`, { data: { items: [...items, { ...items[0], id: "other-notice", userId: "other", message: "Other user's notification" }] } });
  await login(page);
  const bell = page.getByRole("link", { name: "Notifications, 12 unread", exact: true });
  await expect(bell).toBeVisible();
  const settings = page.getByRole("link", { name: "Account settings", exact: true });
  expect(await bell.evaluate((element) => element.parentElement === document.querySelector('.sidebar-settings-button[href="/settings"]')?.parentElement)).toBe(true);
  await expect(settings).toBeVisible();
  await bell.click();
  await expect(page).toHaveURL(/\/dashboard\/notifications$/);
  const panel = page.getByRole("region", { name: "Notifications", exact: true });
  await expect(panel.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  await expect(page.locator(".dashboard-content > section.notification-panel")).toBeVisible();
  await expect(page.locator("[popover]")).toHaveCount(0);
  await expect(panel.locator("li")).toHaveCount(10);
  await panel.screenshot({ path: test.info().outputPath("notifications-desktop.png") });
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await panel.screenshot({ path: test.info().outputPath("notifications-dark.png") });
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await expect(panel.getByText("1 minute ago", { exact: true })).toBeVisible();
  await expect(panel.locator("time").first()).toHaveAttribute("title", /\d/);
  await expect(panel.getByRole("link", { name: "Edit story", exact: true })).toHaveAttribute("href", "/dashboard/posts/story-1/edit");
  await expect(panel.locator("li").nth(1).getByRole("link")).toHaveCount(0);
  await expect(panel.getByText("Other user's notification")).toHaveCount(0);
  await panel.getByRole("button", { name: "Mark as read", exact: true }).first().click();
  await expect(page.getByRole("link", { name: "Notifications, 11 unread", exact: true })).toBeVisible();
  await expect(panel.locator("li").first().getByText("Unread", { exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Next", exact: true }).click();
  await expect(panel.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await expect(panel.locator("li")).toHaveCount(2);
  await panel.getByRole("button", { name: "Mark all as read", exact: true }).click();
  await expect(page.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Mark all as read", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "My stories", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My stories", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Notifications", exact: true }).click();
  await expect(panel).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("notifications-mobile.png"), fullPage: true });
  await page.getByRole("link", { name: "My stories", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My stories", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, "other@test.local");
  await page.getByRole("link", { name: "Notifications, 1 unread", exact: true }).click();
  await expect(panel.getByText("Other user's notification")).toBeVisible();
  await expect(panel.getByText(items[0].message, { exact: true })).toHaveCount(0);
});

test("notifications recover from list and read failures and show an empty state", async ({ page, request }) => {
  await login(page);
  const bell = page.getByRole("link", { name: "Notifications", exact: true });
  await expect(bell).toBeVisible();
  await request.post(`${api}/__fail-request`, { data: { path: "/me/notifications", method: "GET", message: "Notifications unavailable", status: 503 } });
  await bell.click();
  await expect(page).toHaveURL(/\/dashboard\/notifications$/);
  const panel = page.getByRole("region", { name: "Notifications", exact: true });
  await expect(panel.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  await expect(page.locator(".dashboard-content > section.notification-panel")).toBeVisible();
  await expect(page.locator("[popover]")).toHaveCount(0);
  await expect(panel.getByRole("alert")).toContainText("Notifications unavailable");
  await panel.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(panel.getByText("No notifications yet.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "My stories", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My stories", exact: true })).toBeVisible();
  await request.post(`${api}/__notification-fixtures`, { data: { items: [{ id: "retry-notice", userId: "author", type: "post_deleted", blogId: "story-1", blogTitle: "Deleted", message: "Deleted story notification", readAt: null, createdAt: new Date().toISOString() }] } });
  await bell.click();
  await expect(panel.getByText("Just now", { exact: true })).toBeVisible();
  await request.post(`${api}/__fail-request`, { data: { path: "/me/notifications/retry-notice/read", method: "PATCH", message: "Unable to mark as read", status: 503 } });
  await panel.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Unable to mark as read");
  await expect(page.getByRole("link", { name: "Notifications, 1 unread", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(bell).toBeVisible();
  await page.reload();
  await expect(panel.getByText("Deleted story notification", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Mark as read", exact: true })).toHaveCount(0);
});

async function mockVoiceSearch(page: Page, apiName = "SpeechRecognition") {
  // Exercise the browser integration without recording audio or calling a speech service.
  await page.addInitScript((apiName) => {
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((event: { results: { transcript: string }[][] }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      receive = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        if (detail.error) this.onerror?.({ error: detail.error });
        else this.onresult?.({ results: [[{ transcript: detail.text }]] });
        window.removeEventListener("voice-test", this.receive);
        this.onend?.();
      };
      start() { window.addEventListener("voice-test", this.receive); }
      abort() {
        document.body.dataset.voiceAborted = "true";
        window.removeEventListener("voice-test", this.receive);
        this.onerror?.({ error: "aborted" });
        this.onend?.();
      }
    }
    for (const name of ["SpeechRecognition", "webkitSpeechRecognition"])
      Object.defineProperty(window, name, { configurable: true, value: name === apiName ? FakeRecognition : undefined });
  }, apiName);
}

for (const apiName of ["SpeechRecognition", "webkitSpeechRecognition"]) {
  test(`voice search fills the existing input and submits current filters using ${apiName}`, async ({ page }) => {
    await mockVoiceSearch(page, apiName);
    await page.goto("/?page=2#journal");
    await page.getByRole("combobox", { name: "Category", exact: true }).selectOption("ideas");
    await page.getByRole("combobox", { name: "Tag", exact: true }).selectOption("thinking");
    await page.getByLabel("Search stories", { exact: true }).fill("Replace this");
    await page.getByRole("button", { name: "Search by voice", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Listening" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel voice search", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Author", { exact: true }).fill("Alex");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("voice-test", { detail: { text: " story 1 " } })));
    await expect(page).toHaveURL(/q=story\+1/);
    await expect(page.getByLabel("Search stories", { exact: true })).toHaveValue("story 1");
    const params = new URL(page.url()).searchParams;
    expect(Object.fromEntries(params)).toEqual({ q: "story 1", author: "Alex", category: "ideas", tag: "thinking" });
    await expect(page.getByText("2 stories", { exact: true }).filter({ visible: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const input = await page.getByLabel("Search stories", { exact: true }).boundingBox();
    const mic = await page.getByRole("button", { name: "Search by voice", exact: true }).boundingBox();
    expect(Math.abs(input!.y - mic!.y)).toBeLessThan(10);
    expect(mic!.x + mic!.width).toBeLessThanOrEqual(390);
    await page.locator("form.search-form").screenshot({ path: test.info().outputPath("voice-search-mobile.png") });
  });
}

test("voice search handles permission errors, cancellation, and navigation cleanup", async ({ page }) => {
  await mockVoiceSearch(page);
  await page.goto("/?q=old#journal");
  await page.getByRole("button", { name: "Search by voice", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("voice-test", { detail: { error: "not-allowed" } })));
  await expect(page.getByRole("status").filter({ hasText: "Allow microphone access" })).toBeVisible();
  await expect(page.getByLabel("Search stories", { exact: true })).toHaveValue("old");
  await page.getByRole("button", { name: "Search by voice", exact: true }).click();
  await page.getByRole("button", { name: "Cancel voice search", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Voice search cancelled" })).toBeVisible();
  await page.evaluate(() => { delete document.body.dataset.voiceAborted; });
  await page.getByRole("button", { name: "Search by voice", exact: true }).click();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page.getByLabel("Search stories", { exact: true })).toHaveValue("");
  await expect(page.locator("body")).toHaveAttribute("data-voice-aborted", "true");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("voice-test", { detail: { text: "stale result" } })));
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  await page.getByRole("button", { name: "Search by voice", exact: true }).click();
  await page.getByRole("link", { name: "Thoughtful story 1", exact: true }).click();
  await expect(page).toHaveURL(/\/blogs\/thoughtful-story-1$/);
  await page.goBack();
  await expect(page.getByRole("button", { name: "Search by voice", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("voice search gives an unsupported-browser fallback and preserves typed search", async ({ page }) => {
  await mockVoiceSearch(page, "unsupported");
  await page.goto("/#journal");
  await page.getByRole("button", { name: "Search by voice", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "not supported in this browser" })).toBeVisible();
  await page.getByLabel("Search stories", { exact: true }).fill("story 1");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=story\+1/);
  await expect(page.getByRole("button", { name: "Search by voice", exact: true })).toBeVisible();
});

test("conversation list shows private summaries, pagination and mobile layout", async ({ page, request }) => {
  const items = Array.from({ length: 22 }, (_, index) => {
    const id = `conversation-${index}`;
    const createdAt = new Date(Date.UTC(2026, 9, 21, 12) - index * 60_000).toISOString();
    return {
      ownerId: "author", id,
      otherUser: { id: `contact-${index}`, displayName: index === 0 ? "Sam Editor" : `Contact ${index}` },
      lastMessage: index === 0 ? null : {
        id: `message-${index}`, conversationId: id, senderId: `contact-${index}`,
        clientMessageId: `client-${index}`, content: index === 1 ? '<script>alert("unsafe")</script>' : index === 2 ? "Long message ".repeat(100) : `Hello from Contact ${index}`,
        isRead: false, createdAt,
      },
      unreadCount: index === 1 ? 3 : 0, createdAt, updatedAt: createdAt,
    };
  });
  await request.post(`${api}/__chat-fixtures`, { data: { items: [...items, {
    ...items[0], id: "other-account-conversation", ownerId: "other", otherUser: { id: "author", displayName: "Alex Writer" },
  }] } });
  await login(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const routePattern = `${api}/chat/conversations?**`;
  await page.route(routePattern, async route => { await gate; await route.continue(); });
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  try {
    await expect(page.getByText("Loading conversations…", { exact: true })).toBeVisible();
  } finally { release(); }
  await page.unrouteAll({ behavior: "wait" });
  await expect(page).toHaveURL(/\/dashboard\/chat$/);
  await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
  const list = page.getByRole("list", { name: "Conversations", exact: true });
  await expect(list.getByRole("listitem")).toHaveCount(20);
  await expect(list.locator(".conversation-name").first()).toHaveText("Sam Editor");
  await expect(list.getByText("No messages yet.", { exact: true })).toBeVisible();
  await expect(list.getByLabel("3 unread messages", { exact: true })).toHaveText("3");
  await expect(list.getByText('<script>alert("unsafe")</script>', { exact: true })).toBeVisible();
  await expect(list.locator("script")).toHaveCount(0);
  await expect(list.locator("time").first()).toHaveAttribute("datetime", items[1].lastMessage!.createdAt);
  await expect(list.locator(".conversation-avatar").first()).toHaveText("S");
  await expect(list.getByRole("button")).toHaveCount(20);
  const readRequests = async () => (await (await request.get(`${api}/__requests`)).json()).filter((entry: { path: string }) => entry.path.startsWith("/api/v1/chat/"));
  await page.getByRole("navigation", { name: "Conversation pages" }).getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.locator(".conversation-name").first()).toHaveText("Contact 20");
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveCount(20);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await list.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("conversations-mobile.png"), fullPage: true });
  const reads = await readRequests();
  expect(reads.every((entry: { path: string; method: string }) => entry.method === "GET" && entry.path.startsWith("/api/v1/chat/conversations?"))).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, "other@test.local");
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByRole("button", { name: "Open conversation with Alex Writer", exact: true })).toBeVisible();
  await expect(list.getByText("Sam Editor", { exact: true })).toHaveCount(0);
});

test("conversation list protects guests and handles empty results and API errors", async ({ page, request }) => {
  await page.goto("/dashboard/chat");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/dashboard/chat");
  await login(page);
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No conversations yet.", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Conversation pages" })).toHaveCount(0);
  await request.post(`${api}/__fail-request`, { data: { path: "/chat/conversations", method: "GET", status: 503, message: "Conversations temporarily unavailable" } });
  await page.reload();
  await expect(page.locator("main [role=alert]")).toContainText("Conversations temporarily unavailable");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No conversations yet.", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No conversations yet.", exact: true })).toBeVisible();
});

function messageHistoryFixture() {
  const first = "11111111-1111-4111-8111-111111111111";
  const second = "22222222-2222-4222-8222-222222222222";
  const messages = Array.from({ length: 45 }, (_, index) => ({
    id: `history-${String(index + 1).padStart(3, "0")}`, conversationId: first,
    senderId: (index + 1) % 2 === 0 ? "author" : "admin", clientMessageId: `client-${index}`,
    content: index === 30 ? 'Message 31 <script>alert("unsafe")</script>' : index === 44 ? "Newest long message ".repeat(80) : `Message ${index + 1}`,
    isRead: false, createdAt: new Date(Date.UTC(2026, 9, 21, 12, index + 1)).toISOString(),
  }));
  const reply = { ...messages[0], id: "other-reply", conversationId: second, senderId: "other", content: "A private reply from Other Writer." };
  const items = [
    { ownerId: "author", id: first, otherUser: { id: "admin", displayName: "Sam Editor" }, lastMessage: messages[44], unreadCount: 23, createdAt: messages[0].createdAt, updatedAt: messages[44].createdAt },
    { ownerId: "author", id: second, otherUser: { id: "other", displayName: "Other Writer" }, lastMessage: reply, unreadCount: 1, createdAt: reply.createdAt, updatedAt: reply.createdAt },
  ];
  return { first, second, items, messages: [...messages, reply] };
}

test("message history orders bubbles, loads older pages without duplicates or scroll jumps, and supports mobile back", async ({ page, request }) => {
  const fixture = messageHistoryFixture();
  await request.post(`${api}/__chat-fixtures`, { data: fixture });
  await login(page);
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  const open = page.getByRole("button", { name: "Open conversation with Sam Editor", exact: true });
  await open.click();
  await expect(open).toHaveAttribute("aria-pressed", "true");
  const history = page.getByRole("region", { name: "Message history", exact: true });
  const messages = history.locator(".chat-message");
  await expect(messages).toHaveCount(20);
  await expect(messages.first()).toHaveAttribute("data-message-id", "history-026");
  await expect(messages.last()).toHaveAttribute("data-message-id", "history-045");
  expect(await history.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(2);
  expect(await history.locator('[data-message-id="history-044"]').evaluate(element => getComputedStyle(element).alignSelf)).toBe("flex-end");
  expect(await history.locator('[data-message-id="history-045"]').evaluate(element => getComputedStyle(element).alignSelf)).toBe("flex-start");
  await expect(history.locator("time").first()).toHaveAttribute("datetime", fixture.messages[25].createdAt);
  await expect(history.getByText('Message 31 <script>alert("unsafe")</script>', { exact: true })).toHaveCount(1);
  await expect(history.locator("script")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Conversations", exact: true }).getByLabel("23 unread messages")).toHaveText("23");
  // A new message shifts offset pagination, so one message overlaps two pages.
  const newer = { ...fixture.messages[44], id: "history-046", content: "Message 46", createdAt: new Date(Date.UTC(2026, 9, 21, 12, 46)).toISOString() };
  await request.post(`${api}/__chat-fixtures`, { data: { items: fixture.items, messages: [...fixture.messages, newer] } });
  await history.evaluate(element => { element.scrollTop = 0; });
  const anchor = history.locator('[data-message-id="history-026"]');
  const before = (await anchor.boundingBox())!.y;
  await history.getByRole("button", { name: "Load older messages", exact: true }).click();
  await expect(messages).toHaveCount(39);
  expect(Math.abs((await anchor.boundingBox())!.y - before)).toBeLessThan(3);
  await history.getByRole("button", { name: "Load older messages", exact: true }).click();
  await expect(messages).toHaveCount(45);
  await expect(messages.first()).toHaveAttribute("data-message-id", "history-001");
  await expect(history.getByRole("button", { name: "Load older messages", exact: true })).toHaveCount(0);
  expect(new Set(await messages.evaluateAll(elements => elements.map(element => element.getAttribute("data-message-id")))).size).toBe(45);
  await history.evaluate(element => { element.scrollTop = 50; });
  await page.locator(".chat-layout").screenshot({ path: test.info().outputPath("history-desktop.png") });
  await page.getByRole("button", { name: "Open conversation with Other Writer", exact: true }).click();
  await expect(messages).toHaveCount(1);
  await expect(history.getByText("A private reply from Other Writer.", { exact: true })).toBeVisible();
  await expect(history.locator('[data-message-id="history-001"]')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".chat-conversations")).toBeHidden();
  expect(await history.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("history-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Close conversation", exact: true }).click();
  await expect(page.getByRole("list", { name: "Conversations", exact: true })).toBeVisible();
  await expect(history).toHaveCount(0);
  const reads = (await (await request.get(`${api}/__requests`)).json()).filter((entry: { path: string }) => entry.path.startsWith("/api/v1/chat/"));
  expect(reads.every((entry: { method: string }) => entry.method === "GET")).toBe(true);
});

test("message history retries failures and handles empty, missing, and forbidden conversations", async ({ page, request }) => {
  const fixture = messageHistoryFixture();
  await request.post(`${api}/__chat-fixtures`, { data: fixture });
  await login(page);
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  await request.post(`${api}/__fail-request`, { data: { path: `/chat/conversations/${fixture.first}/messages`, method: "GET", status: 503, message: "Messages temporarily unavailable" } });
  await page.getByRole("button", { name: "Open conversation with Sam Editor", exact: true }).click();
  const history = page.getByRole("region", { name: "Message history", exact: true });
  await expect(history.getByRole("alert")).toContainText("Messages temporarily unavailable");
  await history.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(history.locator(".chat-message")).toHaveCount(20);
  await request.post(`${api}/__fail-request`, { data: { path: `/chat/conversations/${fixture.first}/messages`, method: "GET", status: 503, message: "Unable to load older messages" } });
  await history.getByRole("button", { name: "Load older messages", exact: true }).click();
  await expect(history.getByRole("alert")).toContainText("Unable to load older messages");
  await expect(history.locator(".chat-message")).toHaveCount(20);
  await history.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(history.locator(".chat-message")).toHaveCount(40);
  await page.getByRole("button", { name: "Close conversation", exact: true }).click();
  await request.post(`${api}/__chat-fixtures`, { data: { items: fixture.items, messages: [] } });
  await page.getByRole("button", { name: "Open conversation with Other Writer", exact: true }).click();
  await expect(history.getByText("No messages yet.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close conversation", exact: true }).click();
  await request.post(`${api}/__chat-fixtures`, { data: { items: [fixture.items[0]], messages: fixture.messages } });
  await page.getByRole("button", { name: "Open conversation with Other Writer", exact: true }).click();
  await expect(history.getByRole("alert")).toContainText("Conversation not found");
  await expect(history.locator(".chat-message")).toHaveCount(0);
  await page.getByRole("button", { name: "Close conversation", exact: true }).click();
  await request.post(`${api}/__chat-fixtures`, { data: { items: [{ ...fixture.items[0], ownerId: "other" }], messages: fixture.messages } });
  await page.getByRole("button", { name: "Open conversation with Sam Editor", exact: true }).click();
  await expect(history.getByRole("alert")).toContainText("not a participant");
  await expect(history.locator(".chat-message")).toHaveCount(0);
});

test("message history ignores late responses and resets on account changes", async ({ page, request }) => {
  const fixture = messageHistoryFixture();
  await request.post(`${api}/__chat-fixtures`, { data: { ...fixture, items: [...fixture.items, {
    ...fixture.items[1], ownerId: "other", otherUser: { id: "author", displayName: "Alex Writer" },
  }] } });
  await login(page);
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${api}/chat/conversations/${fixture.first}/messages?**`, async route => { await gate; await route.continue(); });
  await page.getByRole("button", { name: "Open conversation with Sam Editor", exact: true }).click();
  await expect(page.getByText("Loading messages…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open conversation with Other Writer", exact: true }).click();
  const history = page.getByRole("region", { name: "Message history", exact: true });
  try {
    await expect(history.getByText("A private reply from Other Writer.", { exact: true })).toBeVisible();
  } finally { release(); }
  await page.unrouteAll({ behavior: "wait" });
  await expect(history.locator(".chat-message")).toHaveCount(1);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, "other@test.local");
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open conversation with Sam Editor", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Open conversation with Alex Writer", exact: true }).click();
  await expect(history.locator(".chat-message")).toHaveCount(1);
  await expect(history.locator(".chat-message-outgoing")).toHaveText(/A private reply from Other Writer/);
  await expect(history.locator('[data-message-id="history-026"]')).toHaveCount(0);
});

test("chat sends confirmed messages through the authenticated socket and preserves failed drafts", async ({ page, request }) => {
  const fixture = messageHistoryFixture();
  await request.post(`${api}/__chat-fixtures`, { data: fixture });
  const payloads: { conversationId: string; clientMessageId: string; content: string }[] = [];
  let authenticated = false;
  await page.routeWebSocket("**/socket.io/**", websocket => {
    websocket.onMessage(raw => {
      const packet = raw.toString();
      if (packet.startsWith("40/chat,")) {
        authenticated = !!JSON.parse(packet.slice("40/chat,".length)).accessToken;
        websocket.send('40/chat,{"sid":"test-chat-socket"}');
      }
      const match = packet.match(/^42\/chat,(\d+)(.*)$/);
      if (!match) return;
      const [event, payload] = JSON.parse(match[2]);
      if (event === "message:read") {
        websocket.send(`43/chat,${match[1]}${JSON.stringify([{ ok: true, data: { conversationId: payload.conversationId, readerId: "author", updated: 0 } }])}`);
        return;
      }
      expect(event).toBe("message:send");
      payloads.push(payload);
      const reply = payload.content === "Please fail"
        ? { ok: false, error: { code: "RATE_LIMITED", message: "Please wait before sending again." } }
        : { ok: true, data: { created: true, message: {
          ...payload, id: "saved-through-socket", senderId: "author", isRead: false, createdAt: "2026-10-21T20:00:00Z",
        } } };
      websocket.send(`43/chat,${match[1]}${JSON.stringify([reply])}`);
    });
    websocket.send('0{"sid":"test-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":16384}');
  });
  await login(page);
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  await page.getByRole("button", { name: "Open conversation with Sam Editor", exact: true }).click();
  const composer = page.locator(".chat-composer");
  await expect(composer.getByRole("status")).toHaveText("Chat connected");
  expect(authenticated).toBe(true);
  const input = composer.getByLabel("Message", { exact: true });
  await input.fill("Hello from the chat form");
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  const history = page.getByRole("region", { name: "Message history", exact: true });
  await expect(history.locator('[data-message-id="saved-through-socket"]')).toHaveClass(/chat-message-outgoing/);
  await expect(input).toHaveValue("");
  expect(payloads[0]).toMatchObject({ conversationId: fixture.first, content: "Hello from the chat form" });
  expect(payloads[0].clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
  await input.fill("Please fail");
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(composer.getByRole("alert")).toHaveText("Please wait before sending again.");
  await expect(input).toHaveValue("Please fail");
  await expect(history.locator('[data-message-id="saved-through-socket"]')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const viewport of [
    { width: 1385, height: 837 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
    { width: 390, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      const field = await input.boundingBox();
      const send = await composer.getByRole("button", { name: "Send", exact: true }).boundingBox();
      const metrics = await page.locator(".chat-layout").evaluate(element => ({
        top: element.getBoundingClientRect().top, height: element.getBoundingClientRect().height,
        scrollY: window.scrollY, viewportHeight: window.innerHeight,
        visualHeight: window.visualViewport?.height,
      }));
      return { field, send, metrics, fits: !!field && !!send && field.y >= 0 && send.y >= 0 &&
        field.y + field.height <= viewport.height && send.y + send.height <= viewport.height };
    }, { message: `Message field and Send must fit inside ${viewport.width}×${viewport.height} without page scrolling` }).toMatchObject({ fits: true });
  }
  await page.setViewportSize({ width: 1385, height: 837 });
  await page.screenshot({ path: test.info().outputPath("chat-viewport-desktop.png") });
  await composer.screenshot({ path: test.info().outputPath("chat-composer-mobile.png") });
});

test("chat receives live messages without duplicates, preserves reading position, and recovers after reconnect", async ({ page, request }) => {
  const fixture = messageHistoryFixture();
  await request.post(`${api}/__chat-fixtures`, { data: fixture });
  let deliver!: (message: (typeof fixture.messages)[number]) => void;
  let disconnect!: () => void;
  const events: string[] = [];
  await page.routeWebSocket("**/socket.io/**", websocket => {
    deliver = message => websocket.send(`42/chat,${JSON.stringify(["message:new", message])}`);
    disconnect = () => websocket.send("41/chat,");
    websocket.onMessage(raw => {
      const packet = raw.toString();
      if (packet.startsWith("40/chat,")) websocket.send('40/chat,{"sid":"live-test-chat"}');
      const match = packet.match(/^42\/chat,(?:\d+)?(.*)$/);
      if (match) {
        const [event] = JSON.parse(match[1]);
        events.push(event);
        const ack = packet.match(/^42\/chat,(\d+)/);
        if (event === "message:read" && ack)
          websocket.send(`43/chat,${ack[1]}${JSON.stringify([{ ok: true, data: { updated: 0 } }])}`);
      }
    });
    websocket.send('0{"sid":"live-test-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":16384}');
  });
  await login(page);
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  await page.getByRole("button", { name: "Open conversation with Sam Editor", exact: true }).click();
  const history = page.getByRole("region", { name: "Message history", exact: true });
  const messages = history.locator(".chat-message");
  await expect(page.locator(".chat-composer").getByRole("status")).toHaveText("Chat connected");
  await expect(messages).toHaveCount(20);
  const incoming = { ...fixture.messages[0], id: "live-incoming", clientMessageId: "live-client", content: 'Hello live <script>alert("unsafe")</script>', createdAt: "2026-10-21T15:00:00Z" };
  const items = fixture.items.map(item => item.id === fixture.first ? { ...item, lastMessage: incoming, unreadCount: 24, updatedAt: incoming.createdAt } : item);
  await request.post(`${api}/__chat-fixtures`, { data: { items, messages: [...fixture.messages, incoming] } });
  deliver(incoming);
  await expect(messages).toHaveCount(21);
  await expect(history.locator('[data-message-id="live-incoming"]')).toHaveClass(/chat-message-incoming/);
  await expect(history.getByText(incoming.content, { exact: true })).toBeVisible();
  await expect(page.locator(".conversation-preview").filter({ hasText: "Hello live" })).toBeVisible();
  await expect(page.getByLabel("24 unread messages", { exact: true })).toBeVisible();
  expect(await history.locator("script").count()).toBe(0);
  expect(await history.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(3);
  deliver(incoming);
  await expect(history.locator('[data-message-id="live-incoming"]')).toHaveCount(1);
  await history.evaluate(element => { element.scrollTop = 50; });
  const another = { ...incoming, id: "live-second", clientMessageId: "live-client-2", content: "Arrived while reading older messages", createdAt: "2026-10-21T15:01:00Z" };
  deliver(another);
  await expect(messages).toHaveCount(22);
  expect(await history.evaluate(element => element.scrollTop)).toBe(50);
  deliver({ ...incoming, id: "other-conversation-event", conversationId: fixture.second, senderId: "other", content: "A message in the other conversation" });
  await expect(history.locator('[data-message-id="other-conversation-event"]')).toHaveCount(0);
  disconnect();
  await expect(page.locator(".chat-composer").getByRole("status")).toContainText("Chat disconnected");
  const offline = { ...incoming, id: "offline-incoming", clientMessageId: "offline-client", content: "Saved while you were offline", createdAt: "2026-10-21T15:02:00Z" };
  await request.post(`${api}/__chat-fixtures`, { data: { items, messages: [...fixture.messages, incoming, another, offline] } });
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(page.locator(".chat-composer").getByRole("status")).toHaveText("Chat connected");
  await expect(history.locator('[data-message-id="offline-incoming"]')).toBeVisible();
  await expect(history.locator('[data-message-id="live-incoming"]')).toHaveCount(1);
  await history.getByRole("button", { name: "Load older messages", exact: true }).click();
  await expect(messages).toHaveCount(40);
  await history.getByRole("button", { name: "Load older messages", exact: true }).click();
  await expect(messages).toHaveCount(48);
  expect(new Set(await messages.evaluateAll(elements => elements.map(element => element.getAttribute("data-message-id")))).size).toBe(48);
  await page.getByRole("button", { name: "Open conversation with Other Writer", exact: true }).click();
  await expect(history.getByText("A private reply from Other Writer.", { exact: true })).toBeVisible();
  deliver(incoming);
  await expect(history.locator('[data-message-id="live-incoming"]')).toHaveCount(0);
  expect(events.every(event => event === "message:read")).toBe(true);
});

test("chat starts and reuses private conversations and shows recipient errors", async ({ page, request }) => {
  await login(page);
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  await page.getByLabel("Recipient user ID", { exact: true }).fill("other");
  await page.getByRole("button", { name: "Start conversation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Other Writer", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Message history", exact: true }).getByText("No messages yet.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close conversation", exact: true }).click();
  await page.getByLabel("Recipient user ID", { exact: true }).fill("other");
  await page.getByRole("button", { name: "Start conversation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open conversation with Other Writer", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Close conversation", exact: true }).click();
  await page.getByLabel("Recipient user ID", { exact: true }).fill("author");
  await page.getByRole("button", { name: "Start conversation", exact: true }).click();
  await expect(page.locator(".chat-start [role=alert]")).toContainText("cannot chat with yourself");
  await page.getByLabel("Recipient user ID", { exact: true }).fill("unknown");
  await page.getByRole("button", { name: "Start conversation", exact: true }).click();
  await expect(page.locator(".chat-start [role=alert]")).toContainText("Recipient not found");
  const requests = await (await request.get(`${api}/__requests`)).json();
  expect(requests.filter((entry: { path: string; method: string }) => entry.path === "/api/v1/chat/conversations" && entry.method === "POST")).toHaveLength(4);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, "other@test.local");
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open conversation with Alex Writer", exact: true })).toBeVisible();
});

test("chat typing, keyboard sending, and canonical read receipts work together", async ({ page, request }) => {
  const fixture = messageHistoryFixture();
  let messages = [...fixture.messages];
  let items = [...fixture.items];
  await request.post(`${api}/__chat-fixtures`, { data: { items, messages } });
  const events: string[] = [];
  let deliver!: (event: string, data: object) => void;
  await page.routeWebSocket("**/socket.io/**", websocket => {
    deliver = (event, data) => websocket.send(`42/chat,${JSON.stringify([event, data])}`);
    websocket.onMessage(async raw => {
      const packet = raw.toString();
      if (packet.startsWith("40/chat,")) websocket.send('40/chat,{"sid":"additional-features"}');
      const match = packet.match(/^42\/chat,(\d*)(.*)$/);
      if (!match) return;
      const [event, payload] = JSON.parse(match[2]);
      events.push(event);
      if (!match[1]) return;
      if (event === "message:read") {
        messages = messages.map(message => message.conversationId === payload.conversationId && message.senderId !== "author" ? { ...message, isRead: true } : message);
        items = items.map(item => item.id === payload.conversationId ? { ...item, unreadCount: 0 } : item);
        await request.post(`${api}/__chat-fixtures`, { data: { items, messages } });
        websocket.send(`43/chat,${match[1]}${JSON.stringify([{ ok: true, data: { conversationId: payload.conversationId, readerId: "author", updated: 23 } }])}`);
      }
      if (event === "message:send") {
        const message = { ...payload, id: "keyboard-sent", senderId: "author", isRead: false, createdAt: "2026-10-22T10:00:00Z" };
        messages.push(message);
        await request.post(`${api}/__chat-fixtures`, { data: { items, messages } });
        websocket.send(`43/chat,${match[1]}${JSON.stringify([{ ok: true, data: { message, created: true } }])}`);
      }
    });
    websocket.send('0{"sid":"feature-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":16384}');
  });
  await login(page);
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  await page.getByRole("button", { name: "Open conversation with Sam Editor", exact: true }).click();
  const composer = page.locator(".chat-composer");
  await expect(composer.getByText("Chat connected", { exact: true })).toBeVisible();
  const input = composer.getByLabel("Message", { exact: true });
  await input.focus();
  await expect.poll(() => events.filter(event => event === "message:read").length).toBeGreaterThan(0);
  await expect(page.getByLabel("23 unread messages", { exact: true })).toHaveCount(0);
  deliver("typing:start", { conversationId: fixture.second, userId: "other" });
  await expect(composer.getByText("Sam Editor is typing…", { exact: true })).toHaveCount(0);
  deliver("typing:start", { conversationId: fixture.first, userId: "admin" });
  await expect(composer.getByText("Sam Editor is typing…", { exact: true })).toBeVisible();
  deliver("typing:stop", { conversationId: fixture.first, userId: "admin" });
  await expect(composer.getByText("Sam Editor is typing…", { exact: true })).toHaveCount(0);
  await input.fill("First line");
  await input.press("Shift+Enter");
  await input.press("End");
  await input.press("B");
  expect(events.filter(event => event === "message:send")).toHaveLength(0);
  await expect.poll(() => events.filter(event => event === "typing:start").length).toBe(1);
  await input.press("Enter");
  const sent = page.locator('[data-message-id="keyboard-sent"]');
  await expect(sent).toContainText("First line");
  await expect(sent.locator(".chat-read-status")).toHaveText("Sent");
  await expect(input).toHaveValue("");
  expect(events).toContain("typing:stop");
  messages = messages.map(message => message.id === "keyboard-sent" ? { ...message, isRead: true } : message);
  await request.post(`${api}/__chat-fixtures`, { data: { items, messages } });
  deliver("message:read", { conversationId: fixture.first, readerId: "admin", updated: 1 });
  await expect(sent.locator(".chat-read-status")).toHaveText("Read");
  deliver("typing:start", { conversationId: fixture.first, userId: "admin" });
  await expect(composer.getByText("Sam Editor is typing…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open conversation with Other Writer", exact: true }).click();
  await expect(composer.getByText("Sam Editor is typing…", { exact: true })).toHaveCount(0);
});

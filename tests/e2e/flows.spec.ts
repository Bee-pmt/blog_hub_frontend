import { test, expect, Page } from "@playwright/test";
const api = "http://localhost:5301/api/v1";
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

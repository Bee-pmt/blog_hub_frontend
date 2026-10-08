import { test, expect, Page } from "@playwright/test";
const api = "http://localhost:5301/api/v1";
test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__reset`);
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
  await expect(page.getByText("12 stories", { exact: true })).toBeVisible();
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
  await expect(page.getByText("2 stories", { exact: true })).toBeVisible();
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
  page,
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
  await page.route(`${api}/categories/cat-1`, (route) => route.fulfill({
    status: 409,
    json: { message: "Name already exists" },
  }), { times: 1 });
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
  await expect(
    page.getByText("Editing Other Writer’s story.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: "Draft saved." })).toBeVisible();
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
  await page.goto("/dashboard/admin/posts/story-2/edit");
  await expect(
    page.getByRole("combobox", { name: "Category", exact: true }),
  ).toHaveValue("");
});
test("mobile layout, dark theme and keyboard accessible controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("12 stories", { exact: true })).toBeVisible();
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
  const created = page.waitForResponse((response) => response.url() === `${api}/blogs` && response.request().method() === "POST");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const firstResponse = await created;
  expect(firstResponse.request().headers()["content-type"]).toContain("multipart/form-data; boundary=");
  const first = await firstResponse.json();
  expect(first.coverImageUrl).toMatch(/^\/images\/.+\.png$/);
  await expect(page).toHaveURL(/\/posts\/[^/]+\/edit$/);
  await expect(page.getByRole("img", { name: "Story cover", exact: true })).toHaveAttribute("src", `http://localhost:5301${first.coverImageUrl}`);
  await picker.setInputFiles({ ...image, name: "replacement.png" });
  await request.post(`${api}/__fail-save`);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator('.notice[role="alert"]')).toHaveText("Temporary save failure");
  await expect(page.locator('[data-sonner-toast][data-type="error"]').filter({ hasText: "Temporary save failure" })).toBeVisible();
  await expect(page.getByText("Selected: replacement.png", { exact: true })).toBeVisible();
  const replaced = page.waitForResponse((response) => response.url() === `${api}/blogs/${first.id}` && response.request().method() === "PATCH" && response.ok());
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const replacement = await (await replaced).json();
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

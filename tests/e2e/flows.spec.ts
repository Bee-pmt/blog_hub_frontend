import { test, expect, Page } from "@playwright/test";
import type { ChatMessage } from "@/modules/chat/types";
import { encode } from "next-auth/jwt";
const api = "http://localhost:5301/api/v1";
async function openSidebar(page: Page) {
  const sidebar = page.getByRole("complementary", { name: "Sidebar", exact: true });
  await expect(sidebar).toBeVisible();
  const toggle = sidebar.getByRole("button", { name: "Menu", exact: true });
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
  return sidebar;
}
async function clickWorkspaceLink(page: Page, name: string | RegExp) {
  const sidebar = await openSidebar(page);
  const labels: Record<string, string> = { "Users · Admin": "Manage Users", "All stories · Admin": "All Stories" };
  if (name === "Account settings") await sidebar.locator("summary[aria-label='Account menu']").click();
  const label = typeof name === "string" ? new RegExp(`^${labels[name] || name}$`, "i") : name;
  await sidebar.getByRole("link", { name: label, exact: true }).click();
}
async function signOut(page: Page) {
  const sidebar = await openSidebar(page);
  if (!await sidebar.locator(".sidebar-user").evaluate(element => element.hasAttribute("open"))) await sidebar.locator("summary[aria-label='Account menu']").click();
  await sidebar.getByRole("button", { name: "Sign out", exact: true }).click();
}
async function expectUnreadCount(page: Page, count: string) {
  const sidebar = await openSidebar(page);
  await expect(sidebar.locator(".chat-unread-count")).toHaveText(count);
}
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
  await openSidebar(page);
  await expect(page.locator(".sidebar-user-info strong").filter({ hasText: "Google Writer" })).toBeVisible();
  expect((await page.context().cookies()).some(cookie => cookie.name === "bloghub_google")).toBe(false);
  await signOut(page);
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
  await signOut(page);
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
test("published stories, combined URL filters, scrolling feed and safe article", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("12 stories", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("journal.png"),
    fullPage: true,
  });
  await expect(page.getByRole("navigation", { name: "Story pages" })).toHaveCount(0);
  await page.locator(".feed-sentinel:visible").scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Thoughtful story 10", exact: true })).toBeVisible();
  await expect(page.locator(".feed-card:visible")).toHaveCount(12);
  await expect(page).not.toHaveURL(/page=2/);
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
  await expect(page.getByRole("dialog", { name: "Sidebar", exact: true })).not.toBeVisible();
  await openSidebar(page);
  await page.locator("summary[aria-label='Account menu']").click();
  await expect(page.locator(".dashboard-sidebar").getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.reload();
  await openSidebar(page);
  await expect(
    page.locator(".sidebar-user-info strong").filter({ hasText: "New Writer" }),
  ).toBeVisible();
  await signOut(page);
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
  await clickWorkspaceLink(page, "Write a story");
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
    page.getByRole("heading", { name: "You do not have permission to open this workspace." }),
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
  await expect(otherStory.getByRole("button", { name: "Move to Trash", exact: true })).toBeVisible();
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

  const authorContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
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
  await openSidebar(otherTab);
  await otherTab.locator("summary[aria-label='Account menu']").click();
  await expect(otherTab.getByRole("link", { name: "Account settings" })).toBeVisible();
  await clickWorkspaceLink(page, "Account settings");
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
  await clickWorkspaceLink(page, "Users · Admin");
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
  await page.getByRole("button", { name: "Promote to admin", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "blogs.delete", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "blogs.restore", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "blogs.purge", exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Promote to admin", exact: true }).click();
  await page.getByRole("checkbox", { name: "blogs.moderate", exact: true }).check();
  await page.getByRole("button", { name: "Save access", exact: true }).click();
  await expect(table.getByRole("button", { name: "Edit permissions", exact: true })).toBeVisible();
  await table.getByRole("button", { name: "Edit permissions", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "blogs.moderate", exact: true })).toBeChecked();
  await page.getByRole("checkbox", { name: "blogs.moderate", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save access", exact: true }).click();
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
  await expect(self.getByRole("button")).toHaveCount(0);
  await expect(self.getByText("Protected account")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("admin-users.png"), fullPage: true });
});

test("authors cannot access user management", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("link", { name: "Manage Users", exact: true })).toHaveCount(0);
  await page.goto("/dashboard/admin/users");
  await expect(page.getByRole("heading", { name: "You do not have permission to open this workspace." })).toBeVisible();
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
  await clickWorkspaceLink(page, "Categories & tags");
  await expect(page.getByRole("button", { name: "Edit Ideas", exact: true })).toBeVisible();
  const taxonomyActions = requests.filter((entry) => entry.action).length;
  await clickWorkspaceLink(page, "Write a story");
  await expect(page.getByRole("textbox", { name: "Story title", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Category", exact: true }).locator("option")).toHaveText(["Select a category", "Ideas", "Life"]);
  expect(requests.filter((entry) => entry.action)).toHaveLength(taxonomyActions);
  await clickWorkspaceLink(page, "My stories");
  await expect(story).toBeVisible();
  expect(listReads()).toBe(initialReads);
  await story.click();
  await expect(page.getByRole("textbox", { name: "Story title", exact: true })).toHaveValue("Thoughtful story 1");
  const detailReads = () => requests.filter((entry) => entry.url === `${api}/me/blogs/story-1`).length;
  expect(detailReads()).toBe(1);
  await clickWorkspaceLink(page, "My stories");
  await story.click();
  await expect(page.getByRole("textbox", { name: "Story title", exact: true })).toHaveValue("Thoughtful story 1");
  expect(detailReads()).toBe(1);
  await page.getByRole("textbox", { name: "Story title", exact: true }).fill("Updated through RTK Query");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Your story is published.", { exact: true })).toBeVisible();
  await clickWorkspaceLink(page, "My stories");
  await expect(page.getByRole("link", { name: "Updated through RTK Query", exact: true })).toBeVisible();
  expect(listReads()).toBeGreaterThan(initialReads);
  // The shared taxonomy write also invalidates already loaded blog labels.
  await clickWorkspaceLink(page, "Categories & tags");
  await page.getByRole("button", { name: "Edit Ideas", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit category", exact: true });
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Shared Ideas");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await clickWorkspaceLink(page, "My stories");
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
  await clickWorkspaceLink(page, "My activity");
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
  await signOut(page);
  await expect(page).toHaveURL(/\/login/);
  await login(page, "admin@test.local");
  await clickWorkspaceLink(page, "My activity");
  await expect(page.getByRole("heading", { name: "Admin moderation", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Edited story 0", exact: true })).toHaveCount(0);
});

test("activity handles empty history, list errors, and missing detail records", async ({ page, request }) => {
  await login(page);
  await request.post(`${api}/__fail-request`, { data: { path: "/me/blog-audit-logs", method: "GET", message: "Activity temporarily unavailable", status: 503 } });
  await clickWorkspaceLink(page, "My activity");
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
  await signOut(page);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("other@test.local");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/posts\/story-1\/edit$/);
  await expect(page.getByRole("heading", { name: "Unable to open this story.", exact: true })).toBeVisible();
  await openSidebar(page);
  await expect(page.locator(".sidebar-user-info strong")).toHaveText("Other Writer");
  // Sign-in returns to the old editor URL; it must not reuse the previous owner's detail.
  await expect(page.getByRole("heading", { name: "Unable to open this story.", exact: true })).toBeVisible();
  await clickWorkspaceLink(page, "My stories");
  await expect(page.getByRole("link", { name: "Thoughtful story 2", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Thoughtful story 1", exact: true })).toHaveCount(0);
  await clickWorkspaceLink(page, "Categories & tags");
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
  await openSidebar(page);
  const bell = page.getByRole("link", { name: "Notifications, 12 unread", exact: true });
  await expect(bell).toBeVisible();
  const settings = page.getByRole("link", { name: "Account settings", exact: true });
  await page.locator("summary[aria-label='Account menu']").click();
  await expect(settings).toBeVisible();
  await openSidebar(page);
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
  await expect(panel.locator("li").nth(1).getByRole("link", { name: "Open My Trash" })).toHaveAttribute("href", "/dashboard/trash");
  await expect(panel.getByText("Other user's notification")).toHaveCount(0);
  await panel.getByRole("button", { name: "Mark as read", exact: true }).first().click();
  await openSidebar(page);
  await expect(page.getByRole("link", { name: "Notifications, 11 unread", exact: true })).toBeVisible();
  await expect(panel.locator("li").first().getByText("Unread", { exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Next", exact: true }).click();
  await expect(panel.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await expect(panel.locator("li")).toHaveCount(2);
  await panel.getByRole("button", { name: "Mark all as read", exact: true }).click();
  await openSidebar(page);
  await expect(page.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Mark all as read", exact: true })).toBeDisabled();
  await clickWorkspaceLink(page, "My stories");
  await expect(page.getByRole("heading", { name: "My stories", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await clickWorkspaceLink(page, "Notifications");
  await expect(panel).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("notifications-mobile.png"), fullPage: true });
  await clickWorkspaceLink(page, "My stories");
  await expect(page.getByRole("heading", { name: "My stories", exact: true })).toBeVisible();
  await signOut(page);
  await expect(page).toHaveURL(/\/login/);
  await login(page, "other@test.local");
  await clickWorkspaceLink(page, "Notifications, 1 unread");
  await expect(panel.getByText("Other user's notification")).toBeVisible();
  await expect(panel.getByText(items[0].message, { exact: true })).toHaveCount(0);
});

test("notifications recover from list and read failures and show an empty state", async ({ page, request }) => {
  await login(page);
  await openSidebar(page);
  const bell = page.getByRole("link", { name: "Notifications", exact: true });
  await expect(bell).toBeVisible();
  await request.post(`${api}/__fail-request`, { data: { path: "/me/notifications", method: "GET", message: "Notifications unavailable", status: 503 } });
  await openSidebar(page);
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
  await clickWorkspaceLink(page, "My stories");
  await expect(page.getByRole("heading", { name: "My stories", exact: true })).toBeVisible();
  await request.post(`${api}/__notification-fixtures`, { data: { items: [{ id: "retry-notice", userId: "author", type: "post_deleted", blogId: "story-1", blogTitle: "Deleted", message: "Deleted story notification", readAt: null, createdAt: new Date().toISOString() }] } });
  await openSidebar(page);
  await bell.click();
  await expect(panel.getByText("Just now", { exact: true })).toBeVisible();
  await request.post(`${api}/__fail-request`, { data: { path: "/me/notifications/retry-notice/read", method: "PATCH", message: "Unable to mark as read", status: 503 } });
  await panel.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Unable to mark as read");
  await openSidebar(page);
  await expect(page.getByRole("link", { name: "Notifications, 1 unread", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await openSidebar(page);
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
    await page.getByRole("button", { name: "Filters", exact: true }).click();
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
  await clickWorkspaceLink(page, /^Messages\b/);
  try {
    await expect(page.getByText("Loading conversations…", { exact: true })).toBeVisible();
  } finally { release(); }
  await page.unrouteAll({ behavior: "wait" });
  await expect(page).toHaveURL(/\/dashboard\/chat$/);
  await expect(page.getByRole("heading", { name: /^Messages\b/ })).toBeVisible();
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
  await signOut(page);
  await expect(page).toHaveURL(/\/login/);
  await login(page, "other@test.local");
  await clickWorkspaceLink(page, /^Messages\b/);
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByRole("button", { name: "Open conversation with Alex Writer", exact: true })).toBeVisible();
  await expect(list.getByText("Sam Editor", { exact: true })).toHaveCount(0);
});

test("conversation list protects guests and handles empty results and API errors", async ({ page, request }) => {
  await page.goto("/dashboard/chat");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/dashboard/chat");
  await login(page);
  await clickWorkspaceLink(page, /^Messages\b/);
  await expect(page.getByRole("heading", { name: "No conversations yet.", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Conversation pages" })).toHaveCount(0);
  await request.post(`${api}/__fail-request`, { data: { path: "/chat/conversations", method: "GET", status: 503, message: "Conversations temporarily unavailable" } });
  await page.reload();
  await expect(page.locator("main [role=alert]")).toContainText("Conversations temporarily unavailable");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No conversations yet.", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /^Messages\b/ })).toBeVisible();
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
  await clickWorkspaceLink(page, /^Messages\b/);
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
  await clickWorkspaceLink(page, /^Messages\b/);
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
  await clickWorkspaceLink(page, /^Messages\b/);
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
  await signOut(page);
  await expect(page).toHaveURL(/\/login/);
  await login(page, "other@test.local");
  await clickWorkspaceLink(page, /^Messages\b/);
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
  await clickWorkspaceLink(page, /^Messages\b/);
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
  let acceptingConnections = true;
  const events: string[] = [];
  await page.routeWebSocket("**/socket.io/**", websocket => {
    deliver = message => websocket.send(`42/chat,${JSON.stringify(["message:new", message])}`);
    disconnect = () => websocket.send("41/chat,");
    websocket.onMessage(raw => {
      const packet = raw.toString();
      if (packet.startsWith("40/chat,") && acceptingConnections) websocket.send('40/chat,{"sid":"live-test-chat"}');
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
  await clickWorkspaceLink(page, /^Messages\b/);
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
  acceptingConnections = false;
  disconnect();
  await expect(page.locator(".chat-composer").getByRole("status")).toContainText("Chat disconnected");
  const offline = { ...incoming, id: "offline-incoming", clientMessageId: "offline-client", content: "Saved while you were offline", createdAt: "2026-10-21T15:02:00Z" };
  await request.post(`${api}/__chat-fixtures`, { data: { items, messages: [...fixture.messages, incoming, another, offline] } });
  acceptingConnections = true;
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
  await clickWorkspaceLink(page, /^Messages\b/);
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
  await signOut(page);
  await expect(page).toHaveURL(/\/login/);
  await login(page, "other@test.local");
  await clickWorkspaceLink(page, /^Messages\b/);
  await expect(page.getByRole("button", { name: "Open conversation with Alex Writer", exact: true })).toBeVisible();
});

test("unread chat badge totals all pages and updates across dashboard navigation", async ({ page, request }) => {
  const timestamp = "2026-10-21T12:00:00Z";
  let items = Array.from({ length: 51 }, (_, i) => ({
    ownerId: "author", id: `badge-${i}`, otherUser: { id: `recipient-${i}`, displayName: `Contact ${i}` },
    lastMessage: null, unreadCount: 2, createdAt: timestamp, updatedAt: timestamp,
  }));
  await request.post(`${api}/__chat-fixtures`, { data: { items } });
  let deliver!: () => void;
  let connections = 0;
  await page.routeWebSocket("**/socket.io/**", websocket => {
    connections++;
    deliver = () => websocket.send(`42/chat,${JSON.stringify(["message:new", { conversationId: "badge-50" }])}`);
    websocket.onMessage(raw => {
      if (raw.toString().startsWith("40/chat,")) websocket.send('40/chat,{"sid":"badge-test"}');
    });
    websocket.send('0{"sid":"badge-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000}');
  });
  await login(page);
  await openSidebar(page);
  const badge = page.locator(".workspace-chat-link:visible .chat-unread-count");
  await expect(badge).toHaveAttribute("aria-label", "102 unread messages");
  await expect(badge).toHaveText("99+");
  await expect.poll(() => connections).toBe(1);
  await clickWorkspaceLink(page, "Categories & tags");
  items = items.map((item, i) => ({ ...item, unreadCount: i === 50 ? 7 : 0 }));
  await request.post(`${api}/__chat-fixtures`, { data: { items } });
  deliver();
  deliver();
  await openSidebar(page);
  await expect(badge).toHaveText("7");
  await expect(badge).toHaveAttribute("aria-label", "7 unread messages");
  await clickWorkspaceLink(page, /^Messages\b/);
  await page.getByRole("button", { name: "Open conversation with Contact 9", exact: true }).click();
  await expect(page.locator(".chat-composer").getByRole("status")).toHaveText("Chat connected");
  expect(connections).toBe(1);
  await page.getByRole("button", { name: "Close conversation", exact: true }).click();
  items = items.map(item => ({ ...item, unreadCount: 0 }));
  await request.post(`${api}/__chat-fixtures`, { data: { items } });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await openSidebar(page);
  await expect(badge).toHaveCount(0);
  await signOut(page);
  await login(page, "other@test.local");
  await openSidebar(page);
  await expect(badge).toHaveCount(0);
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
  await clickWorkspaceLink(page, /^Messages\b/);
  await expectUnreadCount(page, "24");
  await page.getByRole("button", { name: "Open conversation with Sam Editor", exact: true }).click();
  const composer = page.locator(".chat-composer");
  await expect(composer.getByText("Chat connected", { exact: true })).toBeVisible();
  const input = composer.getByLabel("Message", { exact: true });
  await input.focus();
  await expect.poll(() => events.filter(event => event === "message:read").length).toBeGreaterThan(0);
  await expect(page.getByLabel("23 unread messages", { exact: true })).toHaveCount(0);
  await expectUnreadCount(page, "1");
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


test("chat deletes only own messages after confirmation and receives deleted placeholders live", async ({ page, request }) => {
  const fixture = messageHistoryFixture();
  let messages: ChatMessage[] = fixture.messages.map(message => ({ ...message, deletedAt: null }));
  let items = fixture.items.map(item => ({ ...item, lastMessage: item.lastMessage as ChatMessage }));
  const save = () => request.post(`${api}/__chat-fixtures`, { data: { items, messages } });
  await save();
  let deliver!: (event: string, data: object) => void;
  let attempts = 0;
  let allowDelete = false;
  let acknowledge!: () => Promise<void>;
  await page.routeWebSocket("**/socket.io/**", websocket => {
    deliver = (event, data) => websocket.send(`42/chat,${JSON.stringify([event, data])}`);
    websocket.onMessage(raw => {
      const packet = raw.toString();
      if (packet.startsWith("40/chat,")) websocket.send('40/chat,{"sid":"delete-test"}');
      const match = packet.match(/^42\/chat,(\d+)(.*)$/);
      if (!match) return;
      const [event, payload] = JSON.parse(match[2]);
      if (event === "message:read") websocket.send(`43/chat,${match[1]}${JSON.stringify([{ ok: true, data: { updated: 0 } }])}`);
      if (event !== "message:delete") return;
      attempts++;
      if (!allowDelete) {
        websocket.send(`43/chat,${match[1]}${JSON.stringify([{ ok: false, error: { message: "Deletion temporarily unavailable" } }])}`);
        return;
      }
      acknowledge = async () => {
        const deletion = { messageId: payload.messageId, conversationId: fixture.first, deletedAt: "2026-10-28T10:00:00Z" };
        messages = messages.map(message => message.id === payload.messageId ? { ...message, content: null, deletedAt: deletion.deletedAt } : message);
        await save();
        // An already-deleted retry can return an acknowledgement without a new broadcast.
        websocket.send(`43/chat,${match[1]}${JSON.stringify([{ ok: true, data: deletion }])}`);
      };
    });
    websocket.send('0{"sid":"delete-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000}');
  });
  await login(page);
  await clickWorkspaceLink(page, /^Messages\b/);
  await page.getByRole("button", { name: "Open conversation with Sam Editor", exact: true }).click();
  await expect(page.locator(".chat-composer").getByRole("status")).toHaveText("Chat connected");
  const own = page.locator('[data-message-id="history-044"]');
  const incoming = page.locator('[data-message-id="history-045"]');
  await expect(incoming.getByRole("button", { name: "Delete message", exact: true })).toHaveCount(0);
  const deleteButton = own.getByRole("button", { name: "Delete message", exact: true });
  await page.mouse.move(0, 0);
  await expect(deleteButton).toHaveCSS("opacity", "0");
  await own.hover();
  await expect(deleteButton).toHaveCSS("opacity", "1");
  await expect(deleteButton.locator("svg")).toHaveCount(1);
  const bubbleBounds = await own.boundingBox();
  const iconBounds = await deleteButton.boundingBox();
  expect(iconBounds!.x + iconBounds!.width).toBeLessThanOrEqual(bubbleBounds!.x + 1);
  expect(Math.abs(iconBounds!.y + iconBounds!.height / 2 - bubbleBounds!.y - bubbleBounds!.height / 2)).toBeLessThan(1);
  await deleteButton.hover();
  await expect(deleteButton).toHaveCSS("opacity", "1");
  await page.mouse.move(0, 0);
  await deleteButton.focus();
  await expect(deleteButton).toHaveCSS("opacity", "1");
  await own.getByRole("button", { name: "Delete message", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  expect(attempts).toBe(0);
  await own.getByRole("button", { name: "Delete message", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete for everyone", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Deletion temporarily unavailable" })).toBeVisible();
  await expect(own.locator("p")).toHaveText("Message 44");
  allowDelete = true;
  await own.getByRole("button", { name: "Delete message", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete for everyone", exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.getByRole("dialog").getByRole("button", { name: "Deleting…", exact: true })).toBeDisabled();
  await expect(own.locator("p")).toHaveText("Message 44");
  await acknowledge();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(own.locator("p")).toHaveText("This message was deleted.");
  await expect(own.getByRole("button", { name: "Delete message", exact: true })).toHaveCount(0);
  await expect(own.locator(".chat-read-status")).toHaveCount(0);

  const deletion = { messageId: "history-045", conversationId: fixture.first, deletedAt: "2026-10-28T10:01:00Z" };
  messages = messages.map(message => message.id === deletion.messageId ? { ...message, content: null, deletedAt: deletion.deletedAt } : message);
  items = items.map(item => item.id === fixture.first ? { ...item, unreadCount: 22, lastMessage: messages.find(message => message.id === deletion.messageId)! } : item);
  await save();
  // Known deletions must still hide old preview text if its API refresh fails.
  await page.route(`${api}/chat/conversations?**`, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Summary refresh failed" }) }));
  deliver("message:deleted", deletion);
  deliver("message:deleted", deletion);
  await expect(page.locator(".chat-conversations [role=alert]")).toContainText("Summary refresh failed");
  await expect(incoming.locator("p")).toHaveText("This message was deleted.");
  await expect(page.locator(".conversation-preview").filter({ hasText: "This message was deleted." })).toBeVisible();
  await page.unroute(`${api}/chat/conversations?**`);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expectUnreadCount(page, "23");
  deliver("message:new", fixture.messages[44]);
  await expect(incoming.locator("p")).toHaveText("This message was deleted.");

  // A deletion can arrive before its history page has been loaded.
  const old = { ...deletion, messageId: "history-001" };
  messages = messages.map(message => message.id === old.messageId ? { ...message, content: null, deletedAt: old.deletedAt } : message);
  await save();
  deliver("message:deleted", old);
  const history = page.getByRole("region", { name: "Message history", exact: true });
  await history.getByRole("button", { name: "Load older messages", exact: true }).click();
  await expect(history.locator(".chat-message")).toHaveCount(40);
  await history.getByRole("button", { name: "Load older messages", exact: true }).click();
  await expect(page.locator('[data-message-id="history-001"] p')).toHaveText("This message was deleted.");
  await page.reload();
  await page.getByRole("button", { name: "Open conversation with Sam Editor", exact: true }).click();
  await expect(incoming.locator("p")).toHaveText("This message was deleted.");
  await expect(own.locator("p")).toHaveText("This message was deleted.");
});

test("main pages fit mobile, tablet and desktop and keep form controls labelled", async ({ page }) => {
  test.setTimeout(120000);
  const checkLayout = async () => {
    await expect(page.locator("main:visible")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const unnamed = await page.locator('main:visible input:not([type="hidden"]), main:visible select, main:visible textarea').evaluateAll(elements => elements.filter(element => {
      const control = element as HTMLInputElement;
      return !control.labels?.length && !control.getAttribute("aria-label") && !control.getAttribute("aria-labelledby");
    }).map(element => element.outerHTML.slice(0, 120)));
    expect(unnamed).toEqual([]);
  };
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/login", "/register", "/forgot-password"]) {
      await page.goto(route);
      await expect(page.locator("main:visible h1")).toBeVisible();
      await checkLayout();
    }
  }
  await login(page, "admin@test.local");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/dashboard", "/dashboard/taxonomy", "/dashboard/admin/users", "/dashboard/activity", "/dashboard/notifications", "/dashboard/chat", "/dashboard/posts/new", "/settings"]) {
      await page.goto(route);
      await expect(page.locator("main:visible h1")).toBeVisible();
      await checkLayout();
    }
    await page.screenshot({ path: test.info().outputPath(`settings-${width}.png`), fullPage: true });
  }
});

function commentFixture(id: string, content: string, parentId: string | null = null, authorId = "other") {
  return { id, blogId: "story-1", parentId, author: { id: authorId, displayName: authorId === "author" ? "Alex Writer" : "Other Writer" }, content, createdAt: "2026-10-07T00:00:00.000Z", updatedAt: "2026-10-07T00:00:00.000Z" };
}

test("comments allow public reading, lazy replies and separate pagination without HTML rendering", async ({ page, request }) => {
  await request.post(`${api}/__comment-fixtures`, { data: { items: [
    ...Array.from({ length: 11 }, (_, index) => commentFixture(`comment-${index}`, index === 0 ? '<img src=x onerror="alert(1)"> Plain text' : `Comment ${index}`)),
    ...Array.from({ length: 11 }, (_, index) => commentFixture(`reply-${index}`, `Reply ${index}`, "comment-0")),
  ] } });
  await page.goto("/blogs/thoughtful-story-1");
  const section = page.getByRole("region", { name: "Comments", exact: true });
  await expect(section.getByRole("heading", { name: "Comments (11)", exact: true })).toBeVisible();
  await expect(section.getByRole("link", { name: "Sign in to comment" })).toHaveAttribute("href", "/login?returnTo=%2Fblogs%2Fthoughtful-story-1");
  await expect(section.locator(".comment-content").first()).toHaveText('<img src=x onerror="alert(1)"> Plain text');
  await expect(section.locator("img")).toHaveCount(0);
  expect((await (await request.get(`${api}/__requests`)).json()).some((item: { path: string }) => item.path.includes("/replies"))).toBe(false);
  const first = section.locator(":scope > .comment-list > li").first();
  await expect(first.getByRole("button", { name: /^Replies \(/ })).toHaveText("Replies (11)");
  await first.getByRole("button", { name: /^Replies \(/ }).click();
  await expect(first.locator(".comment-replies .comment-row")).toHaveCount(10);
  await first.getByRole("navigation", { name: "Reply pages" }).getByRole("button", { name: "Next" }).click();
  await expect(first.locator(".comment-replies .comment-content")).toHaveText("Reply 10");
  await expect(first.locator(".comment-replies").getByRole("button", { name: /^Replies \(/ })).toHaveCount(0);
  await expect(section.getByRole("navigation", { name: "Comment pages" })).toContainText("Page 1 of 2");
  await section.getByRole("navigation", { name: "Comment pages" }).getByRole("button", { name: "Next" }).click();
  await expect(section.locator(":scope > .comment-list > li .comment-content")).toHaveText("Comment 10");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await section.screenshot({ path: test.info().outputPath("comments-mobile-light.png") });
  await page.getByRole("switch", { name: "Dark mode" }).click();
  await section.screenshot({ path: test.info().outputPath("comments-mobile-dark.png") });
});

test("comments create, edit, reply and cascade delete with validation and safe permissions", async ({ page, request }) => {
  await request.post(`${api}/__comment-fixtures`, { data: { items: [commentFixture("others", "Someone else's comment")] } });
  await login(page);
  await page.goto("/blogs/thoughtful-story-1");
  const section = page.getByRole("region", { name: "Comments", exact: true });
  await expect(section.getByRole("heading", { name: "Comments (1)", exact: true })).toBeVisible();
  const others = section.locator(".comment-row").filter({ has: page.getByText("Someone else's comment", { exact: true }) });
  // Owning the blog does not grant permission to change another user's comment.
  await expect(others.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(others.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await section.getByRole("textbox", { name: "Your comment", exact: true }).fill("   ");
  await section.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(section.getByRole("alert")).toContainText("Use 1–2000 characters");
  await request.post(`${api}/__fail-request`, { data: { path: "/blogs/story-1/comments", method: "POST", status: 400, message: "Invalid comment" } });
  await section.getByRole("textbox", { name: "Your comment", exact: true }).fill("  My new comment  ");
  await section.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(section.getByRole("alert")).toHaveText("Invalid comment");
  await expect(section.getByRole("textbox", { name: "Your comment", exact: true })).toHaveValue("  My new comment  ");
  await page.route(`${api}/blogs/story-1/comments`, async route => {
    if (route.request().method() === "POST") await new Promise(resolve => setTimeout(resolve, 400));
    await route.continue();
  });
  await section.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(section.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
  await expect(section.getByRole("heading", { name: "Comments (2)", exact: true })).toBeVisible();
  const own = section.locator(":scope > .comment-list > li").first();
  await expect(own.locator(".comment-content")).toHaveText("My new comment");
  await own.getByRole("button", { name: "Edit", exact: true }).click();
  await own.getByRole("textbox", { name: "Edit your comment", exact: true }).fill("Updated comment");
  await own.getByRole("button", { name: "Save changes" }).click();
  await expect(own.locator(".comment-content")).toHaveText("Updated comment");
  await expect(own.getByText("Edited", { exact: true })).toBeVisible();
  await own.getByRole("button", { name: /^Replies \(/ }).click();
  await expect(own.getByText("No replies yet.")).toBeVisible();
  await own.getByRole("textbox", { name: "Your reply", exact: true }).fill("First reply");
  await own.getByRole("button", { name: "Post reply" }).click();
  await expect(own.locator(".comment-replies .comment-content")).toHaveText("First reply");
  await expect(own.locator(":scope > .actions").getByRole("button", { name: /^Replies \(/ })).toContainText("Replies (1)");
  const reply = own.locator(".comment-replies .comment-row");
  await reply.getByRole("button", { name: "Edit", exact: true }).click();
  await reply.getByRole("textbox", { name: "Edit your comment", exact: true }).fill("Edited reply");
  await reply.getByRole("button", { name: "Save changes" }).click();
  await expect(reply.locator(".comment-content")).toHaveText("Edited reply");
  await own.locator(":scope > .actions").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("all its replies");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await own.locator(":scope > .actions").getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
  await expect(section.getByRole("heading", { name: "Comments (1)", exact: true })).toBeVisible();
  await expect(section.getByText("Edited reply", { exact: true })).toHaveCount(0);
});

test("comments let admins delete others but not edit them and recover from permission and missing-post errors", async ({ page, request }) => {
  await request.post(`${api}/__comment-fixtures`, { data: { items: [
    commentFixture("parent", "Other person's comment"), commentFixture("child", "Other person's reply", "parent"),
  ] } });
  await login(page, "admin@test.local");
  await page.goto("/blogs/thoughtful-story-1");
  const section = page.getByRole("region", { name: "Comments", exact: true });
  await expect(section.getByText("Other person's comment", { exact: true })).toBeVisible();
  await expect(section.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await section.getByRole("button", { name: /^Replies \(/ }).click();
  const reply = section.locator(".comment-replies .comment-row");
  await expect(reply.getByText("Other person's reply", { exact: true })).toBeVisible();
  await request.post(`${api}/__fail-request`, { data: { path: "/comments/child", method: "DELETE", status: 403, message: "Permission denied" } });
  await reply.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
  await expect(reply.getByRole("alert")).toHaveText("Permission denied");
  await reply.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
  await expect(section.getByText("No replies yet.")).toBeVisible();
  await page.route(`${api}/blogs/story-1/comments?*`, route => route.fulfill({ status: 404, json: { message: "Story is unavailable" } }));
  await page.reload();
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
  await expect(section.getByRole("alert")).toContainText("Story is unavailable");
  await page.unroute(`${api}/blogs/story-1/comments?*`);
  await section.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(section.getByText("Other person's comment", { exact: true })).toBeVisible();
});

test("comments recover pagination after deleting the last item on a comment or reply page", async ({ page, request }) => {
  await request.post(`${api}/__comment-fixtures`, { data: { items: [
    ...Array.from({ length: 11 }, (_, index) => commentFixture(`root-${index}`, `Root ${index}`, null, "author")),
    ...Array.from({ length: 11 }, (_, index) => commentFixture(`child-${index}`, `Child ${index}`, "root-0", "author")),
  ] } });
  await login(page);
  await page.goto("/blogs/thoughtful-story-1");
  const section = page.getByRole("region", { name: "Comments", exact: true });
  const first = section.locator(":scope > .comment-list > li").first();
  await expect(first.getByRole("button", { name: /^Replies \(/ })).toHaveText("Replies (11)");
  await first.getByRole("button", { name: /^Replies \(/ }).click();
  await first.getByRole("navigation", { name: "Reply pages" }).getByRole("button", { name: "Next" }).click();
  await expect(first.locator(".comment-replies .comment-content")).toHaveText("Child 10");
  await first.locator(".comment-replies").getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
  await expect(first.getByRole("heading", { name: "Replies (10)", exact: true })).toBeVisible();
  await expect(first.locator(".comment-replies .comment-row")).toHaveCount(10);
  await expect(first.getByRole("navigation", { name: "Reply pages" })).toHaveCount(0);
  await section.getByRole("navigation", { name: "Comment pages" }).getByRole("button", { name: "Next" }).click();
  await expect(section.locator(".comment-content")).toHaveText("Root 10");
  await section.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
  await expect(section.getByRole("heading", { name: "Comments (10)", exact: true })).toBeVisible();
  await expect(section.locator(":scope > .comment-list > li")).toHaveCount(10);
  await expect(section.getByRole("navigation", { name: "Comment pages" })).toHaveCount(0);
});

test("reactions toggle and replace votes on blogs, comments and expanded replies", async ({ page, request }) => {
  await request.post(`${api}/__comment-fixtures`, { data: { items: [
    commentFixture("parent", "A comment"), commentFixture("reply", "A reply", "parent"),
  ] } });
  await login(page);
  await page.goto("/blogs/thoughtful-story-1");
  const blog = page.getByRole("group", { name: "Story reactions", exact: true });
  await blog.getByRole("button", { name: "Like (0)", exact: true }).click();
  await expect(blog.getByRole("button", { name: "Like (1)", exact: true })).toHaveAttribute("aria-pressed", "true");
  await blog.getByRole("button", { name: "Dislike (0)", exact: true }).click();
  await expect(blog.getByRole("button", { name: "Like (0)", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(blog.getByRole("button", { name: "Dislike (1)", exact: true })).toHaveAttribute("aria-pressed", "true");
  await blog.getByRole("button", { name: "Dislike (1)", exact: true }).click();
  await expect(blog.getByRole("button", { name: "Dislike (0)", exact: true })).toHaveAttribute("aria-pressed", "false");
  const parent = page.locator(".comment-section > .comment-list > li").first();
  const comment = parent.getByRole("group", { name: "Comment reactions", exact: true });
  await comment.getByRole("button", { name: "Like (0)", exact: true }).click();
  await expect(comment.getByRole("button", { name: "Like (1)", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(parent.getByRole("button", { name: "Replies (1)", exact: true })).toBeVisible();
  await parent.getByRole("button", { name: "Replies (1)", exact: true }).click();
  const reply = parent.locator(".comment-replies").getByRole("group", { name: "Comment reactions", exact: true });
  await reply.getByRole("button", { name: "Dislike (0)", exact: true }).click();
  await expect(reply.getByRole("button", { name: "Dislike (1)", exact: true })).toHaveAttribute("aria-pressed", "true");
  const calls = await (await request.get(`${api}/__requests`)).json();
  expect(calls.some((item: { path: string; method: string }) => item.path === "/api/v1/comments/reply/reactions" && item.method === "POST")).toBe(true);
  await blog.getByRole("link", { name: /^Comment \(/ }).click();
  await expect(page.getByRole("region", { name: "Comments", exact: true })).toBeInViewport();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: test.info().outputPath(`article-social-${width}.png`), fullPage: true });
  }
  await page.getByRole("switch", { name: "Dark mode" }).click();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: test.info().outputPath("article-social-mobile-dark.png"), fullPage: true });
});

test("reactions prompt visitors and keep selections separate when accounts change", async ({ page, request }) => {
  await request.post(`${api}/__comment-fixtures`, { data: { items: [commentFixture("parent", "A comment")] } });
  await page.goto("/blogs/thoughtful-story-1");
  const blog = page.getByRole("group", { name: "Story reactions", exact: true });
  await blog.getByRole("button", { name: "Like (0)", exact: true }).click();
  await expect(page.getByRole("link", { name: "Sign in to react", exact: true })).toHaveAttribute("href", "/login?returnTo=%2Fblogs%2Fthoughtful-story-1");
  const calls = await (await request.get(`${api}/__requests`)).json();
  expect(calls.some((item: { path: string; method: string }) => item.path.endsWith("/reactions") && item.method === "POST")).toBe(false);
  expect(calls.some((item: { path: string }) => item.path === "/api/v1/comments/parent/reactions")).toBe(false);
  await login(page);
  await page.goto("/blogs/thoughtful-story-1");
  await blog.getByRole("button", { name: "Like (0)", exact: true }).click();
  await expect(blog.getByRole("button", { name: "Like (1)", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await signOut(page);
  await expect(page).toHaveURL(/\/login/);
  await login(page, "other@test.local");
  await page.goto("/blogs/thoughtful-story-1");
  await expect(blog.getByRole("button", { name: "Like (1)", exact: true })).toHaveAttribute("aria-pressed", "false");
  await blog.getByRole("button", { name: "Dislike (0)", exact: true }).click();
  await expect(blog.getByRole("button", { name: "Dislike (1)", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("reactions reconcile an uncertain POST before allowing another toggle", async ({ page, request }) => {
  await login(page);
  await page.goto("/blogs/thoughtful-story-1");
  const blog = page.getByRole("group", { name: "Story reactions", exact: true });
  await expect(blog.getByRole("button", { name: "Like (0)", exact: true })).toBeEnabled();
  let dropped = false;
  let failRead = false;
  await page.route(`${api}/blogs/story-1/reactions`, async route => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      await route.fetch();
      failRead = true;
      await route.abort("timedout");
    } else if (route.request().method() === "GET" && failRead) {
      await route.fulfill({ status: 503, json: { message: "Unable to refresh reactions" } });
    } else await route.continue();
  });
  await blog.getByRole("button", { name: "Like (0)", exact: true }).click();
  await expect(page.getByText("Unable to refresh reactions", { exact: true })).toBeVisible();
  await expect(blog.getByRole("button", { name: /^Like/ })).toBeDisabled();
  await expect(blog.getByRole("button", { name: /^Dislike/ })).toBeDisabled();
  let calls = await (await request.get(`${api}/__requests`)).json();
  expect(calls.filter((item: { path: string; method: string }) => item.path === "/api/v1/blogs/story-1/reactions" && item.method === "POST")).toHaveLength(1);
  failRead = false;
  await page.getByRole("button", { name: "Refresh reactions", exact: true }).click();
  await expect(blog.getByRole("button", { name: "Like (1)", exact: true })).toBeEnabled();
  await expect(blog.getByRole("button", { name: "Like (1)", exact: true })).toHaveAttribute("aria-pressed", "true");
  await blog.getByRole("button", { name: "Like (1)", exact: true }).click();
  await expect(blog.getByRole("button", { name: "Like (0)", exact: true })).toHaveAttribute("aria-pressed", "false");
  calls = await (await request.get(`${api}/__requests`)).json();
  expect(calls.filter((item: { path: string; method: string }) => item.path === "/api/v1/blogs/story-1/reactions" && item.method === "POST")).toHaveLength(2);
});

test("reactions handle unauthorized POSTs once and missing summaries safely", async ({ page }) => {
  await login(page);
  await page.goto("/blogs/thoughtful-story-1");
  const blog = page.getByRole("group", { name: "Story reactions", exact: true });
  await expect(blog.getByRole("button", { name: "Like (0)", exact: true })).toBeEnabled();
  let posts = 0;
  await page.route(`${api}/blogs/story-1/reactions`, async route => {
    if (route.request().method() === "POST") {
      posts++;
      await route.fulfill({ status: 401, json: { message: "Expired access token" } });
    } else await route.continue();
  });
  await blog.getByRole("button", { name: "Like (0)", exact: true }).click();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  expect(posts).toBe(1);
  await page.unroute(`${api}/blogs/story-1/reactions`);
  await page.route(`${api}/blogs/story-1/reactions`, route => route.fulfill({ status: 404, json: { message: "Story is unavailable" } }));
  await page.reload();
  await expect(page.getByText("Story is unavailable", { exact: true })).toBeVisible();
  await expect(blog.getByRole("button", { name: /^Like/ })).toBeDisabled();
});

test("FAQ help is public, filters topics, shows fallback suggestions and preserves history across navigation", async ({ page, request }) => {
  const before = await (await request.get(`${api}/__requests`)).json();
  expect(before.some((item: { path: string }) => item.path.includes("/faq/"))).toBe(false);
  await page.getByRole("button", { name: "Help", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "BlogHub Help", exact: true });
  await expect(panel.getByRole("textbox", { name: "Ask a question" })).toBeFocused();
  await expect(panel.getByText(/Welcome to BlogHub Help/)).toBeVisible();
  await panel.getByLabel("Help category").selectOption("faq-blogs");
  await expect(panel.getByRole("button", { name: "How do I create a blog post?", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "How do I log in?", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "How do I create a blog post?", exact: true }).click();
  await expect(panel.getByText("Open your dashboard and choose Write a story.", { exact: true })).toBeVisible();
  await panel.getByRole("textbox", { name: "Ask a question" }).fill("Something I cannot find");
  await panel.getByRole("textbox", { name: "Ask a question" }).press("Enter");
  await expect(panel.getByText("I couldn't find an exact answer. Try one of these related questions.", { exact: true })).toBeVisible();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await panel.getByRole("button", { name: "How do I log in?", exact: true }).click();
  await expect(panel.getByText("Use your email and password on the sign-in page.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Help", exact: true })).toBeFocused();
  await page.getByRole("link", { name: "BlogHub home", exact: true }).click();
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(panel.getByText("Use your email and password on the sign-in page.", { exact: true })).toBeVisible();
  await panel.getByLabel("Help category").selectOption("faq-empty");
  await expect(panel.getByText("No suggested questions in this category. You can still type a question.", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await expect(panel.getByRole("button", { name: "Send", exact: true })).toBeInViewport();
  await panel.screenshot({ path: test.info().outputPath("faq-mobile-light.png") });
  await panel.getByRole("button", { name: "Close help" }).click();
  await page.getByRole("switch", { name: "Dark mode" }).click();
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await panel.screenshot({ path: test.info().outputPath("faq-mobile-dark.png") });
});

test("FAQ help validates input, handles unavailable answers and blocks overlapping submissions", async ({ page, request }) => {
  await login(page);
  const credentials: Array<{ authorization?: string; cookie?: string }> = [];
  page.on("request", req => {
    if (req.url().startsWith(`${api}/faq/`)) credentials.push(req.headers());
  });
  await page.getByRole("button", { name: "Help", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "BlogHub Help" });
  const input = panel.getByRole("textbox", { name: "Ask a question" });
  await input.fill(" !!! ");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Use 1–500 characters");
  const calls = await (await request.get(`${api}/__requests`)).json();
  expect(calls.filter((item: { path: string }) => item.path === "/api/v1/faq/ask")).toHaveLength(0);
  await request.post(`${api}/__fail-request`, { data: { path: "/faq/ask", method: "POST", status: 400, message: "Question is invalid" } });
  await input.fill("  How do I log in?  ");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveText("Question is invalid");
  await expect(input).toHaveValue("  How do I log in?  ");
  await request.post(`${api}/__fail-request`, { data: { path: "/faq/faq-create", method: "GET", status: 404, message: "This FAQ is unavailable" } });
  await panel.getByRole("button", { name: "How do I create a blog post?", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveText("This FAQ is unavailable");
  let finish!: () => void;
  const wait = new Promise<void>(resolve => { finish = resolve; });
  let posts = 0;
  let body = "";
  await page.route(`${api}/faq/ask`, async route => {
    posts++;
    body = route.request().postData() || "";
    await wait;
    await route.continue();
  });
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "How do I create a blog post?", exact: true })).toBeDisabled();
  await panel.locator("form").dispatchEvent("submit");
  expect(posts).toBe(1);
  finish();
  await expect(panel.getByText("Use your email and password on the sign-in page.", { exact: true })).toBeVisible();
  expect(JSON.parse(body)).toEqual({ question: "How do I log in?" });
  expect(posts).toBe(1);
  expect(credentials.length).toBeGreaterThan(0);
  for (const headers of credentials) {
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
  }
});

test("FAQ help respects Retry-After across closing and reopening and never retries automatically", async ({ page }) => {
  await page.getByRole("button", { name: "Help", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "BlogHub Help" });
  await expect(panel.getByRole("button", { name: "How do I log in?", exact: true })).toBeVisible();
  let attempts = 0;
  await page.route(`${api}/faq/ask`, async route => {
    attempts++;
    if (attempts === 1) await route.fulfill({
      status: 429,
      headers: { "Retry-After": "2", "Access-Control-Expose-Headers": "Retry-After", "Access-Control-Allow-Origin": "http://localhost:3001" },
      json: { message: "Too many questions" },
    });
    else await route.continue();
  });
  await panel.getByRole("textbox", { name: "Ask a question" }).fill("How do I log in?");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Please wait");
  await expect(panel.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "How do I log in?", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Send", exact: true })).toBeEnabled({ timeout: 6000 });
  expect(attempts).toBe(1);
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(panel.getByText("Use your email and password on the sign-in page.", { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});

test("FAQ help retries metadata manually, renders plain text and keeps older messages in view", async ({ page }) => {
  await page.route(`${api}/faq/categories`, route => route.fulfill({ status: 503, json: { message: "Categories unavailable" } }));
  await page.route(`${api}/faq/suggestions?*`, route => route.fulfill({ status: 503, json: { message: "Suggestions unavailable" } }));
  await page.getByRole("button", { name: "Help", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "BlogHub Help" });
  await expect(panel.getByText("Categories unavailable", { exact: false })).toBeVisible();
  await expect(panel.getByText("Suggestions unavailable", { exact: false })).toBeVisible();
  await page.unroute(`${api}/faq/categories`);
  await page.unroute(`${api}/faq/suggestions?*`);
  await panel.getByRole("button", { name: "Retry categories" }).click();
  await panel.getByRole("button", { name: "Retry suggestions" }).click();
  await expect(panel.getByRole("button", { name: "How do I log in?", exact: true })).toBeVisible();
  let attempts = 0;
  await page.route(`${api}/faq/ask`, async route => {
    attempts++;
    if (attempts === 1) await route.abort("failed");
    else await route.fulfill({ json: { found: true, answer: '<img src=x onerror="alert(1)">\n' + "A useful predefined answer.\n".repeat(45), matchedQuestion: "A question", category: "Account", suggestions: [] } });
  });
  const input = panel.getByRole("textbox", { name: "Ask a question" });
  await input.fill("My first question");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Unable to reach BlogHub");
  expect(attempts).toBe(1);
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(panel.locator(".faq-message-support").last()).toContainText('<img src=x onerror="alert(1)">');
  await expect(panel.locator("img")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await panel.locator(".faq-messages").evaluate(element => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await input.fill("My next question");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  expect(await panel.locator(".faq-messages").evaluate(element => element.scrollTop)).toBe(0);
});

test("feed owns post menus and refreshes all loaded pages after unpublishing and deletion", async ({ page }) => {
  await login(page);
  await page.goto("/");
  await page.locator(".feed-sentinel:visible").scrollIntoViewIfNeeded();
  await expect(page.locator(".feed-card:visible")).toHaveCount(12);
  const own = page.locator(".feed-card:visible").filter({ has: page.getByRole("heading", { name: "Thoughtful story 1", exact: true }) });
  const other = page.locator(".feed-card:visible").filter({ has: page.getByRole("heading", { name: "Thoughtful story 2", exact: true }) });
  await expect(other.locator("summary")).toHaveCount(0);
  await own.locator("summary").click();
  await expect(own.getByRole("link", { name: "Edit", exact: true })).toHaveAttribute("href", "/dashboard/posts/story-1/edit");
  await own.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Thoughtful story 1", exact: true })).toHaveCount(0);
  await expect(page.locator(".feed-card:visible")).toHaveCount(11);
  await expect(page.getByRole("heading", { name: "Thoughtful story 12", exact: true })).toBeVisible();
  const next = page.locator(".feed-card:visible").filter({ has: page.getByRole("heading", { name: "Thoughtful story 3", exact: true }) });
  await next.locator("summary").click();
  await next.getByRole("button", { name: "Move to Trash", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(next).toBeVisible();
  await next.locator("summary").click();
  await next.getByRole("button", { name: "Move to Trash", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page.locator(".feed-card:visible")).toHaveCount(10);
  await expect(page.getByText("10 stories", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Thoughtful story 1", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Thoughtful story 3", exact: true })).toHaveCount(0);
});

test("feed opens the existing editor upward and preserves draft and leave protections", async ({ page }) => {
  await login(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Write a Story", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Write blog", exact: true });
  await expect(editor.getByRole("heading", { name: "Write your story", exact: true })).toBeInViewport();
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(editor).toHaveCSS("animation-name", "feed-editor-open");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => {
      const panel = await editor.boundingBox();
      const header = await page.locator(".site-header").boundingBox();
      return Math.abs(panel!.y - header!.y - header!.height);
    }).toBeLessThan(2);
    const panel = await editor.boundingBox();
    const feed = await page.locator(".feed-main").boundingBox();
    expect(Math.abs(panel!.width - feed!.width)).toBeLessThan(2);
    expect(Math.abs(panel!.x - feed!.x)).toBeLessThan(2);
  }
  await editor.getByLabel("Story title", { exact: true }).fill("An inline story");
  await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption("cat-1");
  await editor.getByRole("button", { name: "Markdown source", exact: true }).click();
  await editor.getByRole("textbox", { name: "Story content", exact: true }).fill("## Inline writing\n\nThe same editor and validation.");
  await editor.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(editor.getByRole("heading", { name: "Edit your story", exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  await editor.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "An inline story", exact: true })).toBeVisible();
  await expect(page.getByText("13 stories", { exact: true })).toBeVisible();
  const card = page.locator(".feed-card:visible").filter({ has: page.getByRole("heading", { name: "An inline story", exact: true }) });
  await expect(card.getByRole("link", { name: /^Comment \(/ })).toHaveAttribute("href", /\/blogs\/an-inline-story#comments$/);
  await card.getByRole("button", { name: "Like (0)", exact: true }).click();
  await expect(card.getByRole("button", { name: "Like (1)", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Write blog", exact: false }).click();
  await editor.getByLabel("Story title", { exact: true }).fill("Keep my unsaved writing");
  page.once("dialog", dialog => dialog.dismiss());
  await page.keyboard.press("Escape");
  await expect(editor).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await editor.getByRole("button", { name: "Back to feed", exact: false }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole("button", { name: "Write blog", exact: false }).click();
  await expect(editor.getByText("Unsaved writing found.", { exact: true })).toBeVisible();
});

test("feed writing prompts visitors to sign in and returns to the inline editor", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good ideas/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Write blog", exact: false }).click();
  await page.getByLabel("Email", { exact: true }).fill("author@test.local");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\?write=1#feed-editor$/);
  await expect(page.getByRole("dialog", { name: "Write blog", exact: true }).getByRole("heading", { name: "Write your story", exact: true })).toBeInViewport();
});

test("feed keeps loaded cards on scroll errors and fits mobile and desktop themes", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator(".feed-card:visible")).toHaveCount(9);
  await request.post(`${api}/__fail-request`, { data: { path: "/blogs", method: "GET", status: 503, message: "Feed temporarily unavailable" } });
  await page.locator(".feed-sentinel:visible").scrollIntoViewIfNeeded();
  await expect(page.getByRole("alert").filter({ hasText: "Feed temporarily unavailable" })).toBeVisible();
  await expect(page.locator(".feed-card:visible")).toHaveCount(9);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".feed-card:visible")).toHaveCount(12);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("link", { name: "Write blog", exact: false })).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath(`feed-${width}.png`) });
  }
  await page.getByRole("switch", { name: "Dark mode" }).click();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: test.info().outputPath("feed-mobile-dark.png") });
});

test("owner Trash restores drafts with the same identity and separately confirms permanent deletion", async ({ page }) => {
  await login(page);
  await page.goto("/dashboard");
  const story = page.locator(".manage-row:visible").filter({ has: page.getByRole("heading", { name: "Thoughtful story 1", exact: true }) });
  await story.getByRole("button", { name: "Move to Trash", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("will move to Trash");
  await page.getByRole("dialog").getByRole("button", { name: "Move to Trash", exact: true }).click();
  await expect(story).toHaveCount(0);
  await clickWorkspaceLink(page, "My Trash");
  let trashed = page.locator(".manage-row:visible").filter({ hasText: "Thoughtful story 1" });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`trash-${width}.png`), fullPage: true });
  }
  await trashed.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Story preview" })).toContainText("A fresh perspective");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await trashed.getByRole("button", { name: "Restore", exact: true }).click();
  const open = page.getByRole("link", { name: "Open draft editor", exact: true });
  await expect(open).toHaveAttribute("href", "/dashboard/posts/story-1/edit");
  await open.click();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Move to Trash", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to Trash", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await clickWorkspaceLink(page, "My Trash");
  trashed = page.locator(".manage-row:visible").filter({ hasText: "Thoughtful story 1" });
  await trashed.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("comments, replies, reactions");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(trashed).toBeVisible();
  await trashed.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Trash is empty." })).toBeVisible();
});

test("restricted admins see only granted controls and refresh revoked access without retrying writes", async ({ page, request }) => {
  await request.post(`${api}/__user-access`, { data: { id: "author", role: "admin", permissions: ["blogs.moderate", "users.manage"] } });
  await login(page);
  await openSidebar(page);
  await expect(page.getByRole("link", { name: "Admin Trash", exact: true })).toBeVisible();
  await page.goto("/dashboard/admin/posts");
  const other = page.locator(".manage-row:visible").filter({ has: page.getByRole("heading", { name: "Thoughtful story 2", exact: true }) });
  await expect(other.getByRole("button", { name: "Inspect", exact: true })).toBeVisible();
  await expect(other.getByRole("button", { name: "Move to Trash", exact: true })).toHaveCount(0);
  await expect(other.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
  await page.goto("/dashboard/admin/users");
  await expect(page.getByRole("button", { name: "Promote to admin", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit permissions", exact: true })).toHaveCount(0);
  const main = page.getByRole("row").filter({ hasText: "admin@test.local" });
  await expect(main.getByRole("button")).toHaveCount(0);
  await page.goto("/dashboard/admin/posts");
  await expect(other.getByRole("button", { name: "Unpublish", exact: true })).toBeVisible();
  await request.post(`${api}/__user-access`, { data: { id: "author", role: "admin", permissions: [] } });
  await other.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You do not have permission to open this workspace.", exact: true })).toBeVisible();
  const requests = await (await request.get(`${api}/__requests`)).json();
  expect(requests.filter((item: { path: string; method: string }) => item.path === "/api/v1/admin/blogs/story-2/status" && item.method === "PATCH")).toHaveLength(1);
});

test("admin-trashed stories require admin restore and keep publication restrictions", async ({ page, browser, request }) => {
  await login(page, "admin@test.local");
  await page.goto("/dashboard/admin/posts");
  let post = page.locator(".manage-row:visible").filter({ has: page.getByRole("heading", { name: "Thoughtful story 1", exact: true }) });
  await post.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(post.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
  await post.getByRole("button", { name: "Move to Trash", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to Trash", exact: true }).click();
  await clickWorkspaceLink(page, "Admin Trash");
  post = page.locator(".manage-row:visible").filter({ hasText: "Thoughtful story 1" });
  await expect(post.getByRole("button", { name: "Restore", exact: true })).toBeVisible();
  const context = await browser.newContext();
  try {
    const author = await context.newPage();
    await login(author);
    await clickWorkspaceLink(author, "My Trash");
    const ownerPost = author.locator(".manage-row:visible").filter({ hasText: "Thoughtful story 1" });
    await expect(ownerPost).toContainText("an authorized administrator must restore");
    await expect(ownerPost.getByRole("button", { name: "Restore", exact: true })).toHaveCount(0);
    await expect(ownerPost.getByRole("button", { name: "Delete permanently", exact: true })).toBeVisible();
    await post.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(post).toHaveCount(0);
    await author.goto("/dashboard/posts/story-1/edit");
    await expect(author.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
    await expect(author.getByLabel("Story title", { exact: true })).toHaveValue("Thoughtful story 1");
  } finally { await context.close(); }
  await request.post(`${api}/__user-access`, { data: { id: "author", role: "admin", permissions: ["blogs.moderate"] } });
});


test("Admin Trash does not infer restore or purge authority from the delete grant", async ({ page, request }) => {
  await login(page, "admin@test.local");
  await page.goto("/dashboard/admin/posts");
  const story = page.locator(".manage-row:visible").filter({ has: page.getByRole("heading", { name: "Thoughtful story 2", exact: true }) });
  await story.getByRole("button", { name: "Move to Trash", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to Trash", exact: true }).click();
  await expect(story).toHaveCount(0);
  await page.context().clearCookies();
  await request.post(`${api}/__user-access`, { data: { id: "author", role: "admin", permissions: ["blogs.moderate", "blogs.delete"] } });
  await page.goto("/login");
  await login(page);
  await clickWorkspaceLink(page, "Admin Trash");
  const trashed = page.locator(".manage-row:visible").filter({ hasText: "Thoughtful story 2" });
  await expect(trashed.getByRole("button", { name: "Preview", exact: true })).toBeVisible();
  await expect(trashed.getByRole("button", { name: "Restore", exact: true })).toHaveCount(0);
  await expect(trashed.getByRole("button", { name: "Delete permanently", exact: true })).toHaveCount(0);
});

test("sidebar is built in with visitor links and no toggle icon", async ({ page }) => {
  await page.goto("/");
  const sidebar = await openSidebar(page);
  await expect(page.getByRole("button", { name: "Open sidebar", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("navigation", { name: "Account navigation" }).getByRole("link")).toHaveText(["Log in", "Sign up"]);
  await expect(sidebar.getByRole("navigation", { name: "Workspace navigation" })).toHaveCount(0);
  await expect(page.locator(".feed-page")).toBeVisible();
  await sidebar.getByRole("link", { name: "Sign up", exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(sidebar).toBeVisible();
});

test("built-in sidebar preserves permissions and responsive layouts", async ({ page, request }) => {
  await request.post(`${api}/__user-access`, { data: { id: "author", role: "admin", permissions: ["blogs.moderate"] } });
  await login(page);
  await page.goto("/");
  const sidebar = await openSidebar(page);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await openSidebar(page);
    await expect(sidebar.getByRole("link", { name: "My Trash", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Admin Trash", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Manage Users", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1440) {
      const aside = await sidebar.boundingBox();
      const feed = await page.locator(".feed-main").boundingBox();
      expect(aside!.x + aside!.width).toBeLessThan(feed!.x);
      expect(feed!.width).toBeGreaterThan(500);
      await expect(page.getByRole("complementary", { name: "Discover more" })).toBeVisible();
    }
    await page.screenshot({ path: test.info().outputPath(`built-in-sidebar-${width}.png`), fullPage: true });
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await page.screenshot({ path: test.info().outputPath("built-in-sidebar-dark.png") });
  await sidebar.getByRole("link", { name: "My Stories", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(sidebar).toBeVisible();
});

test("article card contrast, circular avatar and comment action count stay correct", async ({ page }) => {
  await page.goto("/blogs/thoughtful-story-1");
  const card = page.locator(".article");
  await expect(card).toBeVisible();
  expect(await card.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(await page.locator("body").evaluate(element => getComputedStyle(element).backgroundColor));
  await expect(page.locator(".article-avatar")).toHaveCSS("border-radius", "50%");
  await expect(page.locator(".article-avatar")).toHaveCSS("background-color", "rgb(66, 92, 105)");
  const action = page.locator(".reaction-comment");
  await expect(action).toHaveText("Comment (0)");
  await login(page);
  await page.goto("/blogs/thoughtful-story-1");
  const comments = page.getByRole("region", { name: "Comments", exact: true });
  await comments.getByRole("textbox", { name: "Your comment", exact: true }).fill("Counting this comment");
  await comments.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(action).toHaveText("Comment (1)");
  await comments.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(action).toHaveText("Comment (0)");
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("article-mobile.png"), fullPage: true });
});


test("feed discovery, compact filters and mobile menu preserve the existing journeys", async ({ page }) => {
  await page.goto("/");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("heading", { name: "Explore Stories", exact: true })).toBeVisible();
  const discovery = page.getByRole("complementary", { name: "Discover more" });
  await expect(discovery.getByRole("heading", { name: "Recently published" })).toBeVisible();
  await expect(discovery.locator(".recent-stories li")).toHaveCount(3);
  const filters = page.getByRole("button", { name: "Filters", exact: true });
  await expect(filters).toHaveAttribute("aria-expanded", "false");
  await filters.click();
  await page.getByLabel("Author", { exact: true }).fill("Alex");
  await filters.click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/author=Alex/);
  await expect(page.getByLabel("Author", { exact: true })).toHaveValue("Alex");
  await page.getByRole("link", { name: /Clear filters/ }).click();
  await expect(page).not.toHaveURL(/author=/);
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 1360) await expect(discovery).toBeHidden();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const card = page.locator(".feed-card").first();
      expect(await card.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(await page.locator("body").evaluate(element => getComputedStyle(element).backgroundColor));
      await page.screenshot({ path: test.info().outputPath(`feed-${width}-${theme}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 900 });
  const sidebar = page.getByRole("complementary", { name: "Sidebar", exact: true });
  const menu = sidebar.getByRole("button", { name: "Menu", exact: true });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await sidebar.getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await login(page);
  await openSidebar(page);
  const profile = sidebar.locator("summary[aria-label='Account menu']");
  await profile.click();
  await expect(sidebar.getByRole("link", { name: "Account settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sidebar.locator(".sidebar-user")).not.toHaveAttribute("open", "");
  await expect(profile).toBeFocused();
});


test("header shares the responsive content edges and light surfaces preserve dark mode", async ({ page }) => {
  await login(page);
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Sidebar", exact: true });
  for (const width of [360, 820, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const logo = await page.getByRole("link", { name: "BlogHub home", exact: true }).boundingBox();
    const aside = await sidebar.boundingBox();
    const nav = await page.getByRole("navigation", { name: "Main navigation", exact: true }).boundingBox();
    const content = await page.locator(".site-content").boundingBox();
    expect(Math.abs(logo!.x - aside!.x)).toBeLessThan(1);
    expect(Math.abs(nav!.x + nav!.width - content!.x - content!.width)).toBeLessThan(1);
    if (width >= 1360) {
      const discovery = await page.locator(".discovery-card").first().boundingBox();
      expect(Math.abs(nav!.x + nav!.width - discovery!.x - discovery!.width)).toBeLessThan(1);
    }
    if (width === 360) expect(Math.abs(logo!.y + logo!.height / 2 - nav!.y - nav!.height / 2)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await openSidebar(page);
  const messages = sidebar.getByRole("link", { name: /^Messages/ });
  const stories = sidebar.getByRole("link", { name: "My Stories", exact: true });
  expect((await messages.locator("span").first().boundingBox())!.x).toBe((await stories.locator("span").first().boundingBox())!.x);
  expect(await messages.evaluate(element => getComputedStyle(element).justifyContent)).not.toBe("space-between");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  for (const [theme, colors] of [["light", ["rgb(255, 255, 255)", "rgb(247, 247, 248)", "rgb(255, 255, 255)"]], ["dark", ["rgb(20, 21, 23)", "rgb(28, 28, 28)", "rgb(28, 28, 28)"]]] as const) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await expect(page.locator("body")).toHaveCSS("background-color", colors[0]);
    await expect(page.locator(".site-header")).toHaveCSS("background-color", colors[0]);
    for (const selector of [".workspace-sidebar", ".feed-card", ".feed-search", ".discovery-card"])
      await expect(page.locator(selector).first()).toHaveCSS("background-color", colors[1]);
    await expect(page.getByLabel("Search stories", { exact: true })).toHaveCSS("background-color", colors[2]);
    await expect(page.getByLabel("Author", { exact: true })).toHaveCSS("background-color", colors[2]);
    await page.screenshot({ path: test.info().outputPath(`header-surfaces-${theme}.png`) });
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => { document.documentElement.dataset.theme = "system"; });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(20, 21, 23)");
  await expect(page.getByLabel("Search stories", { exact: true })).toHaveCSS("background-color", "rgb(28, 28, 28)");
});

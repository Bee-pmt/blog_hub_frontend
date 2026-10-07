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
  await page.goto("/register");
  await page.getByLabel("Display name", { exact: true }).fill("New Writer");
  await page.getByLabel("Email", { exact: true }).fill("new@test.local");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "You’re ready to write." }),
  ).toBeVisible();
  await login(page, "new@test.local");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "New Writer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=/);
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
  await expect(page.getByRole("status").filter({ hasText: /^Draft saved\.$/ })).toBeVisible();
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
  await expect(page.getByRole("status").filter({ hasText: /^Draft saved\.$/ })).toBeVisible();
});
test("author taxonomy permissions and blocked admin route", async ({
  page,
}) => {
  await login(page);
  await page.goto("/dashboard/taxonomy");
  await expect(
    page.getByRole("textbox", { name: "Rename Ideas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Rename Life", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Rename Ideas", exact: true })
    .fill("Fresh Ideas");
  await page
    .locator(".taxonomy-row")
    .filter({ hasText: "/ideas" })
    .getByRole("button", { name: "Rename", exact: true })
    .click();
  await expect(page.getByText("/fresh-ideas", { exact: true })).toBeVisible();
  await page.goto("/dashboard/admin/posts");
  await expect(
    page.getByRole("heading", { name: "This workspace is for admins." }),
  ).toBeVisible();
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
  await expect(page.getByRole("status").filter({ hasText: /^Draft saved\.$/ })).toBeVisible();
  await page.goto("/dashboard/taxonomy");
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
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
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
  await expect(page.getByRole("status").filter({ hasText: /^Draft saved\.$/ })).toBeVisible();
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

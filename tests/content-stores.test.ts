import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest, Blog, BlogInput, BlogPage, Category, Tag } from "@/type/type";
import { createBlogStore, blogListKey } from "@/store/blog-store";
import { createTaxonomyStore } from "@/store/taxonomy-store";
import { getEditableBlog, getManagedBlogs, saveBlog, setBlogStatus, deleteBlog, saveTaxonomy, deleteTaxonomy } from "@/lib/api";
import { getTaxonomyAction } from "@/action/content";

vi.mock("@/lib/api", async (original) => ({
  ...await original<typeof import("@/lib/api")>(),
  getEditableBlog: vi.fn(), getManagedBlogs: vi.fn(), saveBlog: vi.fn(),
  setBlogStatus: vi.fn(), deleteBlog: vi.fn(), saveTaxonomy: vi.fn(), deleteTaxonomy: vi.fn(),
}));
vi.mock("@/action/content", () => ({ getTaxonomyAction: vi.fn() }));
const api: ApiRequest = vi.fn();
const blog: Blog = {
  id: "story-1", title: "A story", slug: "a-story", content: "Body", status: "draft",
  author: { id: "author", displayName: "Writer" }, categoryId: null, category: null,
  categoryName: "Uncategorized", tags: [], coverImageUrl: null, publicationBlocked: false,
  publishedAt: null, createdAt: "2026-10-13", updatedAt: "2026-10-13",
};
const page: BlogPage = { items: [{ ...blog, excerpt: "Body" }], page: 1, limit: 10, total: 1, totalPages: 1 };
const category: Category = { id: "cat-1", name: "Ideas", slug: "ideas", createdById: "author", createdAt: "2026-10-13", updatedAt: "2026-10-13" };
const tag: Tag = { ...category, id: "tag-1", name: "Thinking", slug: "thinking", categoryId: "cat-1" };
const input: BlogInput = { title: "Updated", content: "Updated body", tagIds: [], status: "draft" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.mocked(getManagedBlogs).mockResolvedValue(page);
  vi.mocked(getEditableBlog).mockResolvedValue(blog);
  vi.mocked(saveBlog).mockResolvedValue({ ...blog, ...input });
  vi.mocked(setBlogStatus).mockResolvedValue(blog);
  vi.mocked(deleteBlog).mockResolvedValue(undefined);
  vi.mocked(saveTaxonomy).mockResolvedValue(category);
  vi.mocked(deleteTaxonomy).mockResolvedValue(undefined);
  vi.mocked(getTaxonomyAction).mockResolvedValue({ ok: true, data: { categories: [category], tags: [tag] } });
});
afterEach(() => { vi.resetAllMocks(); vi.restoreAllMocks(); });

describe("Zustand blog store", () => {
  it("shares pending requests, reuses fresh lists, and reloads expired or explicitly refreshed data", async () => {
    const store = createBlogStore();
    const clock = vi.spyOn(Date, "now").mockReturnValue(100000);
    const pending = deferred<BlogPage>();
    vi.mocked(getManagedBlogs).mockReturnValueOnce(pending.promise);
    const first = store.getState().loadBlogs(false, "", 1, api);
    const second = store.getState().loadBlogs(false, "", 1, api);
    expect(getManagedBlogs).toHaveBeenCalledTimes(1);
    pending.resolve(page);
    await Promise.all([first, second]);
    await store.getState().loadBlogs(false, "", 1, api);
    expect(getManagedBlogs).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(160001);
    await store.getState().loadBlogs(false, "", 1, api);
    await store.getState().loadBlogs(false, "", 1, api, true);
    expect(getManagedBlogs).toHaveBeenCalledTimes(3);
  });
  it("separates pages, status filters, admin results, details, and provider instances", async () => {
    const store = createBlogStore();
    await store.getState().loadBlogs(false, "", 1, api);
    await store.getState().loadBlogs(false, "draft", 1, api);
    await store.getState().loadBlogs(false, "", 2, api);
    await store.getState().loadBlogs(true, "", 1, api);
    expect(Object.keys(store.getState().lists)).toHaveLength(4);
    await Promise.all([store.getState().loadBlog(blog.id, false, api), store.getState().loadBlog(blog.id, false, api)]);
    await store.getState().loadBlog(blog.id, true, api);
    expect(getEditableBlog).toHaveBeenCalledTimes(2);
    expect(createBlogStore().getState().lists).toEqual({});
  });
  it("preserves read errors and allows retry without caching failures", async () => {
    const store = createBlogStore();
    vi.mocked(getManagedBlogs).mockRejectedValueOnce(new Error("Offline"));
    await expect(store.getState().loadBlogs(false, "", 1, api)).rejects.toThrow("Offline");
    expect(store.getState().lists[blogListKey(false, "", 1)]).toMatchObject({ loading: false, error: "Offline", fetchedAt: 0 });
    await store.getState().loadBlogs(false, "", 1, api);
    expect(store.getState().lists[blogListKey(false, "", 1)].error).toBe("");
  });
  it("invalidates affected lists after save, moderation, and deletion; reuses the saved detail", async () => {
    const store = createBlogStore();
    await store.getState().loadBlogs(false, "", 1, api);
    await store.getState().save(input, blog.id, null, api);
    expect(store.getState().lists).toEqual({});
    expect((await store.getState().loadBlog(blog.id, false, api)).title).toBe("Updated");
    expect(getEditableBlog).not.toHaveBeenCalled();
    await store.getState().changeStatus(blog.id, "draft", true, api);
    expect(setBlogStatus).toHaveBeenCalledWith(blog.id, "draft", api, true);
    expect(store.getState().details).toEqual({});
    await store.getState().loadBlogs(false, "", 1, api);
    await store.getState().remove(blog.id, api);
    expect(store.getState().lists).toEqual({});
  });
  it("invalidates again when concurrent writes finish after a list was refreshed", async () => {
    const store = createBlogStore();
    const first = deferred<Blog>();
    const second = deferred<Blog>();
    vi.mocked(setBlogStatus).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const firstWrite = store.getState().changeStatus("story-1", "draft", true, api);
    const secondWrite = store.getState().changeStatus("story-2", "draft", true, api);
    first.resolve(blog);
    await firstWrite;
    await store.getState().loadBlogs(true, "", 1, api);
    second.resolve(blog);
    await secondWrite;
    expect(store.getState().lists).toEqual({});
  });
  it("keeps unrelated status lists and detail records after editing a draft", async () => {
    const store = createBlogStore(() => "author");
    const published = { ...blog, id: "story-2", status: "published" as const };
    vi.mocked(getManagedBlogs).mockImplementation(async (_admin, filters) => ({
      ...page, items: [{ ...(filters.status === "published" ? published : blog), excerpt: "Body" }],
    }));
    await store.getState().loadBlogs(false, "draft", 1, api);
    await store.getState().loadBlogs(false, "published", 1, api);
    await store.getState().loadBlogs(true, "published", 1, api);
    vi.mocked(getEditableBlog).mockResolvedValueOnce(published);
    await store.getState().loadBlog(published.id, false, api);
    await store.getState().save(input, blog.id, null, api);
    expect(store.getState().lists[blogListKey(false, "draft", 1)]).toBeUndefined();
    expect(store.getState().lists[blogListKey(false, "published", 1)].data?.items[0].id).toBe("story-2");
    expect(store.getState().lists[blogListKey(true, "published", 1)]).toBeDefined();
    expect(store.getState().details["mine:story-2"].data).toEqual(published);
  });
  it("preserves the admin's own lists when moderating somebody else's post", async () => {
    const store = createBlogStore(() => "admin");
    const other = { ...blog, author: { id: "other", displayName: "Other" } };
    await store.getState().loadBlogs(false, "", 1, api);
    await store.getState().loadBlogs(true, "", 1, api);
    vi.mocked(setBlogStatus).mockResolvedValueOnce(other);
    await store.getState().changeStatus(blog.id, "draft", true, api);
    expect(store.getState().lists[blogListKey(false, "", 1)]).toBeDefined();
    expect(store.getState().lists[blogListKey(true, "", 1)]).toBeUndefined();
  });
  it("invalidates only blogs referencing changed taxonomy", async () => {
    const store = createBlogStore();
    const affected = { ...blog, categoryId: category.id, tags: [{ id: tag.id, name: tag.name, slug: tag.slug, categoryId: category.id }] };
    vi.mocked(getManagedBlogs).mockResolvedValueOnce({ ...page, items: [{ ...affected, excerpt: "Body" }] });
    await store.getState().loadBlogs(false, "", 1, api);
    await store.getState().loadBlogs(false, "", 2, api);
    vi.mocked(getEditableBlog).mockResolvedValueOnce(affected).mockResolvedValueOnce({ ...blog, id: "story-2" });
    await store.getState().loadBlog(blog.id, false, api);
    await store.getState().loadBlog("story-2", false, api);
    store.getState().invalidateTaxonomy("tags", tag.id);
    expect(store.getState().lists[blogListKey(false, "", 1)]).toBeUndefined();
    expect(store.getState().lists[blogListKey(false, "", 2)]).toBeDefined();
    expect(store.getState().details["mine:story-1"]).toBeUndefined();
    expect(store.getState().details["mine:story-2"]).toBeDefined();
  });
  it("allows unrelated in-flight details to complete after a mutation", async () => {
    const store = createBlogStore();
    const pending = deferred<Blog>();
    vi.mocked(getEditableBlog).mockReturnValueOnce(pending.promise);
    const reading = store.getState().loadBlog("story-2", false, api);
    await store.getState().save(input, blog.id, null, api);
    pending.resolve({ ...blog, id: "story-2" });
    await expect(reading).resolves.toMatchObject({ id: "story-2" });
    expect(store.getState().details["mine:story-2"]).toBeDefined();
  });
  it("keeps existing data after rejected writes", async () => {
    const store = createBlogStore();
    await store.getState().loadBlogs(false, "", 1, api);
    vi.mocked(setBlogStatus).mockRejectedValueOnce(new Error("Forbidden"));
    await expect(store.getState().changeStatus(blog.id, "published", false, api)).rejects.toThrow("Forbidden");
    expect(store.getState().lists[blogListKey(false, "", 1)].data).toEqual(page);
  });
  it("ignores reads and saves completing after an account reset", async () => {
    const store = createBlogStore();
    const read = deferred<BlogPage>();
    const write = deferred<Blog>();
    vi.mocked(getManagedBlogs).mockReturnValueOnce(read.promise);
    vi.mocked(saveBlog).mockReturnValueOnce(write.promise);
    const oldRead = store.getState().loadBlogs(false, "", 1, api);
    const oldWrite = store.getState().save(input, blog.id, null, api);
    store.getState().reset();
    await store.getState().loadBlogs(false, "", 1, api);
    read.resolve({ ...page, total: 999 });
    write.resolve(blog);
    await expect(oldRead).rejects.toThrow("Content changed");
    await oldWrite;
    expect(store.getState().lists[blogListKey(false, "", 1)].data?.total).toBe(1);
    expect(store.getState().details).toEqual({});
  });
});

describe("Zustand taxonomy store", () => {
  it("shares categories and tags between readers and refreshes on expiry", async () => {
    const store = createTaxonomyStore(vi.fn());
    const clock = vi.spyOn(Date, "now").mockReturnValue(100000);
    await Promise.all([store.getState().load(), store.getState().load()]);
    await store.getState().load();
    expect(getTaxonomyAction).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ categories: [category], tags: [tag], loading: false });
    clock.mockReturnValue(160001);
    await store.getState().load();
    expect(getTaxonomyAction).toHaveBeenCalledTimes(2);
  });
  it("refreshes taxonomy and invalidates blogs after successful changes, including cascading deletion", async () => {
    const blogs = createBlogStore();
    const store = createTaxonomyStore((kind, id) => blogs.getState().invalidateTaxonomy(kind, id));
    vi.mocked(getManagedBlogs).mockResolvedValueOnce({ ...page, items: [{ ...page.items[0], categoryId: category.id }] });
    await blogs.getState().loadBlogs(false, "", 1, api);
    await store.getState().load();
    vi.mocked(getTaxonomyAction).mockResolvedValueOnce({ ok: true, data: { categories: [{ ...category, name: "Updated" }], tags: [tag] } });
    await store.getState().save("categories", { name: "Updated" }, api, category.id);
    expect(store.getState().categories[0].name).toBe("Updated");
    expect(blogs.getState().lists).toEqual({});
    vi.mocked(getTaxonomyAction).mockResolvedValueOnce({ ok: true, data: { categories: [], tags: [] } });
    await store.getState().remove("categories", category.id, api);
    expect(store.getState().categories).toEqual([]);
    expect(store.getState().tags).toEqual([]);
  });
  it("shows a refresh failure separately from a successful write and can retry", async () => {
    const onChange = vi.fn();
    const store = createTaxonomyStore(onChange);
    vi.mocked(getTaxonomyAction).mockResolvedValueOnce({ ok: false, error: "Offline" });
    await expect(store.getState().save("tags", { name: "Updated" }, api, tag.id)).resolves.toBeUndefined();
    expect(onChange).toHaveBeenCalledOnce();
    expect(store.getState().error).toBe("Offline");
    await store.getState().load(true);
    expect(store.getState().error).toBe("");
  });
  it("does not refresh or invalidate current-account data when an old-account write finishes", async () => {
    const onChange = vi.fn();
    const store = createTaxonomyStore(onChange);
    const write = deferred<Category>();
    vi.mocked(saveTaxonomy).mockReturnValueOnce(write.promise);
    const oldWrite = store.getState().save("categories", { name: "Old account" }, api, category.id);
    store.getState().reset();
    await store.getState().load();
    write.resolve(category);
    await oldWrite;
    expect(onChange).not.toHaveBeenCalled();
    expect(getTaxonomyAction).toHaveBeenCalledTimes(1);
    expect(store.getState().categories).toEqual([category]);
  });
  it("ignores an old read after reset or a newer refresh", async () => {
    const store = createTaxonomyStore(vi.fn());
    const pending = deferred<Awaited<ReturnType<typeof getTaxonomyAction>>>();
    vi.mocked(getTaxonomyAction).mockReturnValueOnce(pending.promise);
    const oldRead = store.getState().load();
    store.getState().reset();
    await store.getState().load();
    pending.resolve({ ok: true, data: { categories: [], tags: [] } });
    await expect(oldRead).rejects.toThrow("Content changed");
    expect(store.getState().categories).toEqual([category]);
  });
});

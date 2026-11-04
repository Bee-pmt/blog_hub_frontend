import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheLife, cacheTag, updateTag } from "next/cache";
import { refreshSessionAction } from "@/modules/auth/actions";
import { contentRequest } from "@/lib/content-client";
import { getCachedBlogs, getCachedBlog } from "@/modules/blogs/cache";
import { getCachedTaxonomy } from "@/modules/taxonomy/cache";
import { mutateContentAction } from "@/actions/content";
import { authenticatedRequest, setSession, clearSession } from "@/lib/session";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/modules/auth/actions", () => ({ refreshSessionAction: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clearSession();
});

describe("public content caching", () => {
  it("tags only public reads and bounds their cache lifetime", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json([])));
    vi.stubGlobal("fetch", fetcher);
    await getCachedBlogs({ page: 2, category: "ideas" });
    await getCachedBlog("hello world");
    await getCachedTaxonomy();
    expect(vi.mocked(cacheTag).mock.calls).toEqual([["blogs"], ["blogs"], ["taxonomy"]]);
    expect(cacheLife).toHaveBeenCalledWith({ stale: 0, revalidate: 60, expire: 120 });
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "http://localhost:5300/api/v1/blogs?page=2&category=ideas",
      "http://localhost:5300/api/v1/blogs/hello%20world",
      "http://localhost:5300/api/v1/categories",
      "http://localhost:5300/api/v1/tags",
    ]);
    for (const [, options] of fetcher.mock.calls)
      expect(new Headers(options.headers).has("Authorization")).toBe(false);
  });
  it("expires blog and taxonomy caches only after successful authorized changes", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await mutateContentAction("/categories/cat-1", "DELETE", undefined, "token")).toMatchObject({ ok: true });
    expect(new Headers(fetcher.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer token");
    expect(vi.mocked(updateTag).mock.calls).toEqual([["blogs"], ["taxonomy"]]);
    vi.mocked(updateTag).mockClear();
    fetcher.mockResolvedValue(Response.json({ message: "Forbidden" }, { status: 403 }));
    expect(await mutateContentAction("/admin/blogs/story-1/status", "PATCH", '{"status":"draft"}', "token")).toMatchObject({ ok: false, status: 403 });
    expect(updateTag).not.toHaveBeenCalled();
  });
  it("refreshes the token once for an expired content write and invalidates only after success", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ message: "Expired" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ id: "story-1" }));
    vi.stubGlobal("fetch", fetcher);
    vi.mocked(refreshSessionAction).mockResolvedValueOnce({
      data: { accessToken: "new", expiresIn: 3600 }, error: "", status: 200,
    });
    setSession({ accessToken: "old", expiresIn: 3600 });
    await contentRequest("/blogs/story-1", "PATCH", { body: "{}" });
    expect(refreshSessionAction).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new Headers(fetcher.mock.calls[1][1].headers).get("Authorization")).toBe("Bearer new");
    expect(vi.mocked(updateTag).mock.calls).toEqual([["blogs"]]);
  });
  it("does not retry or invalidate after a content write loses its connection", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Offline"));
    vi.stubGlobal("fetch", fetcher);
    setSession({ accessToken: "valid", expiresIn: 3600 });
    await expect(contentRequest("/blogs", "POST", { body: "{}" })).rejects.toMatchObject({ status: 0 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(refreshSessionAction).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
  it("rejects unsupported paths before forwarding or invalidating", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const path of ["/auth/logout", "/blogs/../auth/logout", "https://example.com", "/admin/users/user-1/status"])
      expect(await mutateContentAction(path, "PATCH", "{}", "token")).toMatchObject({ ok: false, status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
  it("keeps private reads uncached and invalidates public blogs through the authenticated sender", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ id: "story-1" })));
    vi.stubGlobal("fetch", fetcher);
    setSession({ accessToken: "token", expiresIn: 3600 });
    await authenticatedRequest("/me/blogs");
    await authenticatedRequest("/me/blogs");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(cacheTag).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
    await contentRequest("/admin/blogs/story-1/status", "PATCH", { body: '{"status":"draft"}' });
    expect(vi.mocked(updateTag).mock.calls).toEqual([["blogs"]]);
  });
});

describe("Trash cache writes", () => {
  it.each([
    ["/me/blog-trash/story-1/restore", "POST"],
    ["/admin/blog-trash/story-1/restore", "POST"],
    ["/me/blog-trash/story-1", "DELETE"],
    ["/admin/blog-trash/story-1", "DELETE"],
  ])("forwards %s %s through authenticated cache invalidation", async (path, method) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await mutateContentAction(path, method, undefined, "token")).toMatchObject({ ok: true });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(vi.mocked(updateTag).mock.calls).toEqual([["blogs"]]);
    expect(fetcher.mock.calls[0][1].body).toBeUndefined();
  });
  it.each([404, 409])("expires stale public data on a %s response without retrying", async status => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ message: "State changed" }, { status }));
    vi.stubGlobal("fetch", fetcher);
    expect(await mutateContentAction("/blogs/story-1", "DELETE", undefined, "token")).toMatchObject({ ok: false, status });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(updateTag).toHaveBeenCalledWith("blogs");
  });
});

it("preserves the optional blog deletion version check", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  expect(await mutateContentAction("/blogs/story-1?version=7", "DELETE", undefined, "token")).toMatchObject({ ok: true });
  expect(String(fetcher.mock.calls[0][0])).toContain("/blogs/story-1?version=7");
  expect(await mutateContentAction("/blogs/story-1?version=7&other=1", "DELETE", undefined, "token")).toMatchObject({ ok: false, status: 400 });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/modules/auth/google-actions", () => ({ completeGoogleAction: vi.fn() }));
import { createAppStore } from "@/lib/store";
import { baseApi } from "@/lib/api/baseApi";
import { blogApi } from "@/modules/blogs/store/services/blogApi";
import { taxonomyApi } from "@/modules/taxonomy/store/services/taxonomyApi";
import { userApi } from "@/modules/users/store/services/userApi";
import { authenticatedRequest } from "@/lib/session";
import { contentRequest } from "@/lib/content-client";
import { getTaxonomyAction } from "@/modules/taxonomy/actions";
import {
  sessionEnded,
  restoreAuth,
} from "@/modules/auth/store/slices/authSlice";
vi.mock("@/lib/session", () => ({
  authenticatedRequest: vi.fn(),
  clearSession: vi.fn(),
  refreshSession: vi.fn(),
  setSession: vi.fn(),
  sessionLock: (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/content-client", () => ({ contentRequest: vi.fn() }));
vi.mock("@/modules/taxonomy/actions", () => ({ getTaxonomyAction: vi.fn() }));
vi.mock("@/modules/auth/actions", () => ({
  submitAuthAction: vi.fn(),
  logoutAction: vi.fn(),
  clearSessionAction: vi.fn(),
}));
const page = { items: [], page: 1, limit: 10, total: 0, totalPages: 0 };
const stores: ReturnType<typeof createAppStore>[] = [];
function store() {
  const result = createAppStore();
  stores.push(result);
  return result;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authenticatedRequest).mockResolvedValue(page);
  vi.mocked(contentRequest).mockResolvedValue({ id: "story-1" });
  vi.mocked(getTaxonomyAction).mockResolvedValue({
    ok: true,
    data: { categories: [], tags: [] },
  });
});
afterEach(() => {
  for (const item of stores) item.dispatch(baseApi.util.resetApiState());
  stores.length = 0;
});
describe("RTK Query content", () => {
  it("caches audit pages and immutable details, then refreshes history after a story mutation", async () => {
    const app = store();
    await app.dispatch(blogApi.endpoints.getMyBlogAuditLogs.initiate(1)).unwrap();
    await app.dispatch(blogApi.endpoints.getMyBlogAuditLogs.initiate(1)).unwrap();
    await app.dispatch(blogApi.endpoints.getMyBlogAuditLog.initiate("audit-record")).unwrap();
    expect(authenticatedRequest).toHaveBeenCalledTimes(2);
    expect(authenticatedRequest).toHaveBeenNthCalledWith(1, "/me/blog-audit-logs?page=1&limit=10", "GET", expect.anything());
    expect(authenticatedRequest).toHaveBeenNthCalledWith(2, "/me/blog-audit-logs/audit-record", "GET", expect.anything());
    await app.dispatch(blogApi.endpoints.deleteBlog.initiate("story-1")).unwrap();
    await vi.waitFor(() => expect(authenticatedRequest).toHaveBeenCalledTimes(3));
    expect(authenticatedRequest).toHaveBeenLastCalledWith("/me/blog-audit-logs?page=1&limit=10", "GET", expect.anything());
  });
  it("shares concurrent list requests and reuses cached results", async () => {
    const app = store();
    const args = { admin: false, status: "", page: 1 };
    const one = app.dispatch(blogApi.endpoints.getManagedBlogs.initiate(args));
    const two = app.dispatch(blogApi.endpoints.getManagedBlogs.initiate(args));
    await Promise.all([one.unwrap(), two.unwrap()]);
    await app
      .dispatch(blogApi.endpoints.getManagedBlogs.initiate(args))
      .unwrap();
    expect(authenticatedRequest).toHaveBeenCalledTimes(1);
    one.unsubscribe();
    two.unsubscribe();
  });
  it("separates pages, filters and author/admin views", async () => {
    const app = store();
    for (const args of [
      { admin: false, status: "", page: 1 },
      { admin: false, status: "draft", page: 1 },
      { admin: false, status: "", page: 2 },
      { admin: true, status: "", page: 1 },
    ])
      await app
        .dispatch(blogApi.endpoints.getManagedBlogs.initiate(args))
        .unwrap();
    expect(authenticatedRequest).toHaveBeenCalledTimes(4);
  });
  it("reloads subscribed lists after a successful mutation", async () => {
    const app = store();
    await app
      .dispatch(
        blogApi.endpoints.getManagedBlogs.initiate({
          admin: false,
          status: "",
          page: 1,
        }),
      )
      .unwrap();
    await app
      .dispatch(
        blogApi.endpoints.changeBlogStatus.initiate({
          id: "story-1",
          status: "draft",
          admin: true,
        }),
      )
      .unwrap();
    await vi.waitFor(() =>
      expect(authenticatedRequest).toHaveBeenCalledTimes(2),
    );
    expect(contentRequest).toHaveBeenCalledWith(
      "/admin/blogs/story-1/status",
      "PATCH",
      expect.anything(),
    );
  });
  it("does not invalidate data after a failed mutation", async () => {
    const app = store();
    await app
      .dispatch(
        blogApi.endpoints.getManagedBlogs.initiate({
          admin: false,
          status: "",
          page: 1,
        }),
      )
      .unwrap();
    vi.mocked(contentRequest).mockRejectedValue(new Error("Forbidden"));
    await expect(
      app.dispatch(blogApi.endpoints.deleteBlog.initiate("story-1")).unwrap(),
    ).rejects.toMatchObject({ message: "Forbidden" });
    expect(authenticatedRequest).toHaveBeenCalledTimes(1);
  });
  it("shares taxonomy and invalidates embedded blog labels when taxonomy changes", async () => {
    const app = store();
    await app.dispatch(taxonomyApi.endpoints.getTaxonomy.initiate()).unwrap();
    await app.dispatch(taxonomyApi.endpoints.getTaxonomy.initiate()).unwrap();
    expect(getTaxonomyAction).toHaveBeenCalledOnce();
    await app
      .dispatch(
        blogApi.endpoints.getManagedBlogs.initiate({
          admin: false,
          status: "",
          page: 1,
        }),
      )
      .unwrap();
    await app
      .dispatch(
        taxonomyApi.endpoints.saveTaxonomy.initiate({
          kind: "categories",
          input: { name: "Ideas" },
          id: "cat-1",
        }),
      )
      .unwrap();
    await vi.waitFor(() => expect(getTaxonomyAction).toHaveBeenCalledTimes(2));
    expect(authenticatedRequest).toHaveBeenCalledTimes(2);
  });
  it("clears private queries on account changes and ignores late old-account responses", async () => {
    const app = store();
    vi.mocked(authenticatedRequest).mockResolvedValueOnce({
      id: "author",
      role: "author",
    });
    await app.dispatch(restoreAuth()).unwrap();
    let done!: (value: unknown) => void;
    vi.mocked(authenticatedRequest).mockReturnValueOnce(
      new Promise((resolve) => {
        done = resolve;
      }),
    );
    const pending = app.dispatch(
      blogApi.endpoints.getEditableBlog.initiate({
        id: "private",
        admin: false,
      }),
    );
    app.dispatch(sessionEnded());
    done({ id: "private", content: "secret" });
    await pending;
    expect(Object.keys(app.getState().bloghubApi.queries)).toHaveLength(0);
  });
  it("uses direct authenticated transport for user changes", async () => {
    const app = store();
    await app
      .dispatch(
        userApi.endpoints.updateUser.initiate({
          id: "member",
          change: { role: "admin" },
        }),
      )
      .unwrap();
    expect(authenticatedRequest).toHaveBeenCalledWith(
      "/admin/users/member/role",
      "PATCH",
      expect.anything(),
    );
    expect(contentRequest).not.toHaveBeenCalled();
  });
});

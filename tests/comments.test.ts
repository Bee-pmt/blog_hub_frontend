import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppStore } from "@/lib/store";
import { baseApi } from "@/lib/api/baseApi";
import { commentApi } from "@/modules/blogs/store/services/commentApi";
import { API_BASE, ApiError } from "@/lib/api-client";
import { authenticatedRequest, clearSession } from "@/lib/session";

vi.mock("@/lib/session", () => ({
  authenticatedRequest: vi.fn(), clearSession: vi.fn(),
  refreshSession: vi.fn(), setSession: vi.fn(), sessionLock: (fn: () => unknown) => fn(),
}));
vi.mock("@/modules/auth/google-actions", () => ({ completeGoogleAction: vi.fn() }));
vi.mock("@/modules/auth/actions", () => ({
  submitAuthAction: vi.fn(), logoutAction: vi.fn(), clearSessionAction: vi.fn(),
}));
vi.mock("@/lib/content-client", () => ({ contentRequest: vi.fn() }));
const page = { items: [], page: 1, limit: 10, total: 0, totalPages: 0 };
let store: ReturnType<typeof createAppStore>;
const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  store = createAppStore();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => Response.json(page));
});
afterEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("comments API", () => {
  it("reads comments by blog UUID and replies by parent ID without authentication", async () => {
    await store.dispatch(commentApi.endpoints.getComments.initiate({ blogId: "blog-uuid", page: 2 })).unwrap();
    await store.dispatch(commentApi.endpoints.getComments.initiate({ blogId: "blog-uuid", parentId: "parent-id", page: 3 })).unwrap();
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      `${API_BASE}/blogs/blog-uuid/comments?page=2&limit=10`,
      `${API_BASE}/comments/parent-id/replies?page=3&limit=10`,
    ]);
    for (const [, options] of fetchMock.mock.calls) expect(options.headers.has("Authorization")).toBe(false);
    expect(authenticatedRequest).not.toHaveBeenCalled();
  });

  it.each([
    [{ blogId: "uuid", content: "  Hello  " }, "/blogs/uuid/comments", "POST"],
    [{ blogId: "uuid", parentId: "parent", content: "  Hello  " }, "/comments/parent/replies", "POST"],
    [{ blogId: "uuid", id: "own", content: "  Hello  " }, "/comments/own", "PATCH"],
  ])("sends authenticated trimmed content to the right mutation endpoint: %s", async (input, route, method) => {
    vi.mocked(authenticatedRequest).mockResolvedValue({ id: "saved" });
    await store.dispatch(commentApi.endpoints.saveComment.initiate(input)).unwrap();
    expect(authenticatedRequest).toHaveBeenCalledWith(route, method, { body: '{"content":"Hello"}' });
  });

  it("accepts a 204 deletion and refreshes comments and independently paginated replies", async () => {
    const root = store.dispatch(commentApi.endpoints.getComments.initiate({ blogId: "uuid", page: 1 }));
    const replies = store.dispatch(commentApi.endpoints.getComments.initiate({ blogId: "uuid", parentId: "parent", page: 2 }));
    await Promise.all([root, replies]);
    vi.mocked(authenticatedRequest).mockResolvedValue(undefined);
    await expect(store.dispatch(commentApi.endpoints.deleteComment.initiate({ blogId: "uuid", id: "reply" })).unwrap()).resolves.toBeNull();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(authenticatedRequest).toHaveBeenCalledWith("/comments/reply", "DELETE", { body: undefined });
  });

  it.each([400, 401, 403, 404])("preserves a mutation's %s error for the UI", async status => {
    vi.mocked(authenticatedRequest).mockRejectedValue(new ApiError("Request denied", status));
    await expect(store.dispatch(commentApi.endpoints.saveComment.initiate({ blogId: "uuid", content: "Hello" })).unwrap()).rejects.toEqual({ status, message: "Request denied" });
    expect(clearSession).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });

  it("a public endpoint failure does not end a user's session", async () => {
    fetchMock.mockImplementation(async () => Response.json({ message: "Unavailable" }, { status: 401 }));
    await expect(store.dispatch(commentApi.endpoints.getComments.initiate({ blogId: "uuid", page: 1 })).unwrap()).rejects.toEqual({ status: 401, message: "Unavailable" });
    expect(clearSession).not.toHaveBeenCalled();
  });
});

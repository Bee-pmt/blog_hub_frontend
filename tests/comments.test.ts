import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppStore } from "@/lib/store";
import { baseApi } from "@/lib/api/baseApi";
import { commentApi } from "@/modules/blogs/store/services/commentApi";
import { API_BASE, ApiError } from "@/lib/api-client";
import { authenticatedRequest, clearSession } from "@/lib/session";
import { restoreAuth } from "@/modules/auth/store/slices/authSlice";

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


describe("reaction API", () => {
  const summary = { likeCount: 3, dislikeCount: 1, myReaction: "like" as const };
  it("uses public GET for visitors and authenticated GET for account-specific summaries", async () => {
    fetchMock.mockImplementation(async () => Response.json({ ...summary, myReaction: null }));
    await store.dispatch(commentApi.endpoints.getReactions.initiate({ kind: "blogs", id: "blog-uuid" })).unwrap();
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/blogs/blog-uuid/reactions`);
    expect(fetchMock.mock.calls[0][1].headers.has("Authorization")).toBe(false);
    vi.mocked(authenticatedRequest).mockResolvedValue(summary);
    await store.dispatch(commentApi.endpoints.getReactions.initiate({ kind: "comments", id: "reply-uuid", accountId: "member" })).unwrap();
    expect(authenticatedRequest).toHaveBeenCalledWith("/comments/reply-uuid/reactions", "GET", { body: undefined });
  });

  it("replaces cached counts and selected state from the successful POST response", async () => {
    const target = { kind: "blogs" as const, id: "blog-uuid", accountId: "member" };
    vi.mocked(authenticatedRequest).mockResolvedValueOnce({ likeCount: 2, dislikeCount: 1, myReaction: null });
    await store.dispatch(commentApi.endpoints.getReactions.initiate(target)).unwrap();
    vi.mocked(authenticatedRequest).mockResolvedValueOnce(summary);
    await store.dispatch(commentApi.endpoints.react.initiate({ ...target, type: "like" })).unwrap();
    expect(authenticatedRequest).toHaveBeenLastCalledWith("/blogs/blog-uuid/reactions", "POST", { body: '{"type":"like"}' }, false);
    expect(commentApi.endpoints.getReactions.select(target)(store.getState()).data).toEqual(summary);
  });

  it("never retries a 401 reaction POST and uses the existing session handling", async () => {
    vi.mocked(authenticatedRequest).mockRejectedValue(new ApiError("Expired token", 401));
    await expect(store.dispatch(commentApi.endpoints.react.initiate({ kind: "comments", id: "reply-uuid", accountId: "member", type: "dislike" })).unwrap()).rejects.toEqual({ status: 401, message: "Expired token" });
    expect(authenticatedRequest).toHaveBeenCalledTimes(1);
    expect(authenticatedRequest).toHaveBeenCalledWith("/comments/reply-uuid/reactions", "POST", { body: '{"type":"dislike"}' }, false);
    expect(clearSession).toHaveBeenCalledOnce();
  });

  it("clears account-specific summaries and ignores late reaction results after switching users", async () => {
    vi.mocked(authenticatedRequest).mockResolvedValueOnce({ id: "first", role: "author" });
    await store.dispatch(restoreAuth()).unwrap();
    const first = { kind: "blogs" as const, id: "blog-uuid", accountId: "first" };
    vi.mocked(authenticatedRequest).mockResolvedValueOnce(summary);
    await store.dispatch(commentApi.endpoints.getReactions.initiate(first)).unwrap();
    let finish!: (value: unknown) => void;
    vi.mocked(authenticatedRequest).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = store.dispatch(commentApi.endpoints.react.initiate({ ...first, type: "dislike" }));
    vi.mocked(authenticatedRequest).mockResolvedValueOnce({ id: "second", role: "author" });
    await store.dispatch(restoreAuth()).unwrap();
    finish({ likeCount: 2, dislikeCount: 2, myReaction: "dislike" });
    await pending;
    expect(commentApi.endpoints.getReactions.select(first)(store.getState()).data).toBeUndefined();
  });
});

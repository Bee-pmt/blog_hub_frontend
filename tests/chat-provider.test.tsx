import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ChatProvider, { UnreadChatBadge, useChatConnection } from "@/modules/chat/components/chat-provider";

const mocks = vi.hoisted(() => ({
  path: "/dashboard",
  auth: { user: { id: "author", role: "author" } as { id: string; role: string } | null, loading: false, error: "" },
  count: 3,
  io: vi.fn(), dispatch: vi.fn(), token: vi.fn(), refresh: vi.fn(), query: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.path }));
vi.mock("socket.io-client", () => ({ io: mocks.io }));
vi.mock("@/modules/auth/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/store/hooks", () => ({ useAppDispatch: () => mocks.dispatch }));
vi.mock("@/lib/session", () => ({ withAccessToken: mocks.token, refreshSession: mocks.refresh }));
vi.mock("@/modules/chat/store/services/chatApi", () => ({
  chatApi: { util: { invalidateTags: (tags: string[]) => tags } },
  useGetUnreadChatCountQuery: (...args: unknown[]) => {
    mocks.query(...args);
    return { currentData: { unreadCount: mocks.count } };
  },
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let listeners: Record<string, (...args: unknown[]) => void>;
const socket = { connect: vi.fn(), disconnect: vi.fn(), on: vi.fn(), off: vi.fn() };
function Preview() {
  const { deletions } = useChatConnection();
  return <p data-preview>{deletions.deleted ? "Deleted" : "Original text"}</p>;
}
async function render() {
  await act(async () => root.render(<ChatProvider><UnreadChatBadge /><Preview /></ChatProvider>));
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.path = "/dashboard";
  mocks.auth = { user: { id: "author", role: "author" }, loading: false, error: "" };
  mocks.count = 3;
  mocks.io.mockReturnValue(socket);
  mocks.token.mockImplementation(async send => send("app-token"));
  mocks.refresh.mockResolvedValue("fresh-token");
  listeners = {};
  socket.on.mockImplementation((event, callback) => { listeners[event] = callback; });
  socket.off.mockImplementation((event, callback) => { if (listeners[event] === callback) delete listeners[event]; });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
});

it("shares one authenticated socket across dashboard pages and refreshes counts on incoming events and focus", async () => {
  await render();
  const options = mocks.io.mock.calls[0][1];
  expect(options).toMatchObject({ transports: ["websocket"], autoConnect: false });
  const authenticate = vi.fn();
  await act(async () => options.auth(authenticate));
  expect(authenticate).toHaveBeenCalledWith({ accessToken: "app-token" });
  expect(socket.connect).toHaveBeenCalledTimes(1);
  mocks.path = "/dashboard/taxonomy";
  await render();
  expect(socket.connect).toHaveBeenCalledTimes(1);
  await act(async () => {
    listeners.connect();
    listeners["message:new"]();
    window.dispatchEvent(new Event("focus"));
  });
  expect(mocks.dispatch).toHaveBeenCalledWith(["Conversation", "ChatMessage"]);
  expect(mocks.dispatch.mock.calls.filter(call => call[0].length === 1)).toHaveLength(2);
});

it("ignores pending authentication and server-disconnect recovery after logout", async () => {
  let finish!: () => void;
  mocks.token.mockImplementation(send => new Promise<void>(resolve => {
    finish = () => { send("old-token"); resolve(); };
  }));
  let refresh!: () => void;
  mocks.refresh.mockReturnValue(new Promise<void>(resolve => { refresh = resolve; }));
  await render();
  const authenticate = vi.fn();
  mocks.io.mock.calls[0][1].auth(authenticate);
  await act(async () => listeners.disconnect("io server disconnect"));
  mocks.auth.user = null;
  await render();
  await act(async () => { finish(); refresh(); });
  expect(authenticate).not.toHaveBeenCalled();
  expect(socket.disconnect).toHaveBeenCalledTimes(1);
  expect(socket.connect).toHaveBeenCalledTimes(1);
  expect(container.querySelector(".chat-unread-count")).toBeNull();
});

it("skips guests and public pages, caps the visible badge and keeps its accessible total", async () => {
  mocks.path = "/";
  await render();
  expect(socket.connect).not.toHaveBeenCalled();
  expect(mocks.query).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ skip: true }));
  mocks.path = "/dashboard";
  mocks.count = 124;
  await render();
  expect(container.querySelector(".chat-unread-count")?.textContent).toBe("99+");
  expect(container.querySelector(".chat-unread-count")?.getAttribute("aria-label")).toBe("124 unread messages");
  mocks.count = 0;
  await render();
  expect(container.querySelector(".chat-unread-count")).toBeNull();
});


it("refreshes the affected history, previews and unread total for a deletion outside the chat screen", async () => {
  mocks.path = "/dashboard/taxonomy";
  await render();
  await act(async () => listeners["message:deleted"]({ conversationId: "first", messageId: "deleted", deletedAt: "2026-10-28T00:00:00Z" }));
  expect(mocks.dispatch).toHaveBeenCalledWith(["Conversation", { type: "ChatMessage", id: "first" }]);
});


it("keeps a known deletion when summaries are stale and clears it when the account changes", async () => {
  await render();
  await act(async () => listeners["message:deleted"]({ conversationId: "first", messageId: "deleted", deletedAt: "2026-10-28T00:00:00Z" }));
  expect(container.querySelector("[data-preview]")?.textContent).toBe("Deleted");
  await render();
  expect(container.querySelector("[data-preview]")?.textContent).toBe("Deleted");
  mocks.auth.user = { id: "other", role: "author" };
  await render();
  expect(container.querySelector("[data-preview]")?.textContent).toBe("Original text");
});


it("refreshes credentials and reconnects after a server disconnect", async () => {
  await render();
  await act(async () => listeners.disconnect("io server disconnect"));
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  expect(socket.connect).toHaveBeenCalledTimes(2);
});

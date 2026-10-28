import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ChatMessage, MessagePage } from "@/modules/chat/types";
import MessageHistory from "@/modules/chat/components/message-history";

const mocks = vi.hoisted(() => ({
  data: null as MessagePage | null,
  composer: null as { onSent: (message: ChatMessage) => void; onConnected: () => void } | null,
  dispatch: vi.fn(),
}));
vi.mock("@/lib/api/baseApi", () => ({ queryError: () => "" }));
vi.mock("@/lib/store/hooks", () => ({ useAppDispatch: () => mocks.dispatch }));
vi.mock("@/modules/chat/components/chat-provider", () => ({
  useChatConnection: () => ({ socket: {}, deletions: {}, applyDeletion: vi.fn() }),
}));
vi.mock("@/modules/chat/store/services/chatApi", () => ({
  chatApi: { util: { invalidateTags: (tags: unknown) => tags } },
  useGetMessagesQuery: () => ({ currentData: mocks.data, isFetching: false }),
}));
vi.mock("@/modules/chat/components/message-composer", () => ({
  default: (props: NonNullable<typeof mocks.composer>) => { mocks.composer = props; return null; },
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.data = { items: [], page: 1, limit: 20, total: 0, totalPages: 0 };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
});

it("drops unverified live text outside the latest history page after reconnecting", async () => {
  await act(async () => root.render(<MessageHistory
    conversation={{ id: "thread", otherUser: { id: "other", displayName: "Other" }, lastMessage: null, unreadCount: 0, createdAt: "2026-10-28T00:00:00Z", updatedAt: "2026-10-28T00:00:00Z" }}
    userId="author" onBack={() => {}} />));
  const old: ChatMessage = { id: "old", conversationId: "thread", senderId: "author", clientMessageId: "client", content: "Deleted while offline", deletedAt: null, isRead: false, createdAt: "2026-10-28T00:00:00Z" };
  await act(async () => mocks.composer!.onSent(old));
  expect(container.textContent).toContain(old.content);
  mocks.data = { items: Array.from({ length: 20 }, (_, i) => ({ ...old, id: `new-${i}`, content: "Newer message", createdAt: "2026-10-28T01:00:00Z" })), page: 1, limit: 20, total: 21, totalPages: 2 };
  await act(async () => mocks.composer!.onConnected());
  expect(container.textContent).not.toContain(old.content);
  expect(container.querySelectorAll(".chat-message")).toHaveLength(20);
});

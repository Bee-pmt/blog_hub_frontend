import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MessageComposer from "@/modules/chat/components/message-composer";
import type { ChatMessage } from "@/modules/chat/types";

const mocks = vi.hoisted(() => ({
  io: vi.fn(), refresh: vi.fn(), token: vi.fn(),
}));
vi.mock("socket.io-client", () => ({ io: mocks.io }));
vi.mock("@/lib/session", () => ({
  refreshSession: mocks.refresh,
  withAccessToken: mocks.token,
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let listeners: Record<string, (...args: unknown[]) => void>;
let connection: {
  connected: boolean;
  on: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  removeAllListeners: ReturnType<typeof vi.fn>;
  timeout: ReturnType<typeof vi.fn>;
  emitWithAck: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
};
let onSent = vi.fn<(message: ChatMessage) => void>();
let onReceived = vi.fn<(message: ChatMessage) => void>();
let onConnected = vi.fn<() => void>();

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  listeners = {};
  connection = {
    connected: false,
    on: vi.fn((event, callback) => { listeners[event] = callback; }),
    connect: vi.fn(() => connection),
    disconnect: vi.fn(() => connection),
    removeAllListeners: vi.fn(),
    timeout: vi.fn(() => connection),
    emitWithAck: vi.fn(),
    emit: vi.fn(),
  };
  mocks.io.mockReturnValue(connection);
  mocks.refresh.mockResolvedValue("fresh-token");
  mocks.token.mockImplementation(async (send) => send("app-token"));
  onSent = vi.fn();
  onReceived = vi.fn();
  onConnected = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<MessageComposer conversationId="conversation-a" onSent={onSent} onReceived={onReceived} onConnected={onConnected} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
});
async function connect() {
  await act(async () => {
    connection.connected = true;
    listeners.connect();
  });
}
async function type(text: string) {
  await act(async () => {
    const input = container.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
const message = { id: "saved", conversationId: "conversation-a", content: "Hello", senderId: "author", createdAt: "2026-10-21T00:00:00Z", clientMessageId: "client", isRead: false };

it("authenticates with the existing app token and displays only confirmed sends", async () => {
  const options = mocks.io.mock.calls.at(-1)![1];
  expect(options.transports).toEqual(["websocket"]);
  const callback = vi.fn();
  await act(async () => options.auth(callback));
  expect(callback).toHaveBeenCalledWith({ accessToken: "app-token" });
  await connect();
  await type("Hello");
  let resolve!: (value: unknown) => void;
  connection.emitWithAck.mockReturnValue(new Promise((done) => { resolve = done; }));
  await submit();
  expect(onSent).not.toHaveBeenCalled();
  expect(container.querySelector("textarea")!.disabled).toBe(true);
  await submit();
  expect(connection.emitWithAck).toHaveBeenCalledTimes(1);
  expect(connection.emitWithAck.mock.calls[0][1]).toMatchObject({ conversationId: "conversation-a", content: "Hello" });
  await act(async () => resolve({ ok: true, data: { message, created: true } }));
  expect(onSent).toHaveBeenCalledWith(message);
  expect(container.querySelector("textarea")!.value).toBe("");
});

it("retains the draft and same retry ID when confirmation is lost", async () => {
  await connect();
  await type("Hello");
  connection.emitWithAck.mockRejectedValueOnce(new Error("timeout"));
  await submit();
  const original = connection.emitWithAck.mock.calls[0][1];
  expect(container.textContent).toContain("Delivery could not be confirmed");
  expect(container.querySelector("textarea")!.value).toBe("Hello");
  connection.emitWithAck.mockResolvedValueOnce({ ok: true, data: { message, created: false } });
  await submit();
  expect(connection.emitWithAck.mock.calls[1][1]).toEqual(original);
  expect(onSent).toHaveBeenCalledTimes(1);
});

it("rejects blank and overlong messages, and preserves drafts on backend errors", async () => {
  await connect();
  await type("   ");
  await submit();
  expect(connection.emitWithAck).not.toHaveBeenCalled();
  await type("a".repeat(2001));
  await submit();
  expect(connection.emitWithAck).not.toHaveBeenCalled();
  expect(container.textContent).toContain("2,000 characters");
  await type("Hello");
  connection.emitWithAck.mockResolvedValue({ ok: false, error: { code: "RATE_LIMITED", message: "Please wait before sending again." } });
  await submit();
  expect(container.textContent).toContain("Please wait before sending again.");
  expect(container.querySelector("textarea")!.value).toBe("Hello");
  expect(onSent).not.toHaveBeenCalled();
});

it("refreshes authentication on manual reconnect and never sends while disconnected", async () => {
  await type("Hello");
  await submit();
  expect(connection.emitWithAck).not.toHaveBeenCalled();
  await act(async () => container.querySelector<HTMLButtonElement>("button[type=button]")!.click());
  expect(mocks.refresh).toHaveBeenCalled();
  expect(connection.disconnect).toHaveBeenCalled();
  expect(connection.connect).toHaveBeenCalledTimes(2);
  await act(async () => listeners.connect_error());
  expect(container.textContent).toContain("Unable to connect to chat");
});

it("disconnects on unmount and ignores late send acknowledgements", async () => {
  await connect();
  await type("Hello");
  let resolve!: (value: unknown) => void;
  connection.emitWithAck.mockReturnValue(new Promise((done) => { resolve = done; }));
  await submit();
  await act(async () => root.render(null));
  expect(connection.disconnect).toHaveBeenCalled();
  expect(connection.removeAllListeners).toHaveBeenCalled();
  await act(async () => resolve({ ok: true, data: { message, created: true } }));
  expect(onSent).not.toHaveBeenCalled();
});


it("receives live events with the latest callback without opening another socket", async () => {
  await connect();
  expect(onConnected).toHaveBeenCalledTimes(1);
  await act(async () => listeners["message:new"](message));
  expect(onReceived).toHaveBeenCalledWith(message);
  const nextCallback = vi.fn();
  await act(async () => root.render(<MessageComposer conversationId="conversation-a" onSent={onSent} onReceived={nextCallback} onConnected={onConnected} />));
  await act(async () => listeners["message:new"](message));
  expect(nextCallback).toHaveBeenCalledWith(message);
  expect(onReceived).toHaveBeenCalledTimes(1);
  expect(connection.connect).toHaveBeenCalledTimes(1);
  await connect();
  expect(onConnected).toHaveBeenCalledTimes(2);
  expect(connection.on.mock.calls.filter(([event]) => event === "message:new")).toHaveLength(1);
  const receive = listeners["message:new"];
  await act(async () => root.render(null));
  await act(async () => receive(message));
  expect(nextCallback).toHaveBeenCalledTimes(1);
});

it("throttles local typing and clears remote typing on timeout and disconnect", async () => {
  vi.useFakeTimers();
  await connect();
  await type("H");
  await type("Hello");
  expect(connection.emit.mock.calls.filter(([event]) => event === "typing:start")).toHaveLength(1);
  await act(async () => vi.advanceTimersByTime(1200));
  expect(connection.emit).toHaveBeenCalledWith("typing:stop", { conversationId: "conversation-a" });
  await act(async () => listeners["typing:start"]({ conversationId: "different" }));
  expect(container.textContent).not.toContain("is typing");
  await act(async () => listeners["typing:start"]({ conversationId: "conversation-a" }));
  expect(container.textContent).toContain("is typing");
  await act(async () => vi.advanceTimersByTime(5000));
  expect(container.textContent).not.toContain("is typing");
  await act(async () => listeners["typing:start"]({ conversationId: "conversation-a" }));
  await act(async () => listeners.disconnect());
  expect(container.textContent).not.toContain("is typing");
});

it("marks only the supplied viewed messages after focus and confirms only a successful acknowledgement", async () => {
  vi.useFakeTimers();
  const focus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const onRead = vi.fn();
  await act(async () => root.render(<MessageComposer conversationId="conversation-a" onSent={onSent} onReceived={onReceived} onConnected={onConnected} readMessageIds={["viewed-1"]} onRead={onRead} />));
  await connect();
  await act(async () => vi.advanceTimersByTime(300));
  expect(connection.emitWithAck).not.toHaveBeenCalled();
  focus.mockReturnValue(true);
  let resolve!: (value: unknown) => void;
  connection.emitWithAck.mockReturnValue(new Promise(done => { resolve = done; }));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(connection.emitWithAck).toHaveBeenCalledWith("message:read", { conversationId: "conversation-a" });
  expect(onRead).not.toHaveBeenCalled();
  await act(async () => root.render(<MessageComposer conversationId="conversation-a" onSent={onSent} onReceived={onReceived} onConnected={onConnected} readMessageIds={["viewed-1", "new-unread-2"]} onRead={onRead} />));
  await act(async () => resolve({ ok: true, data: { updated: 1 } }));
  expect(onRead).not.toHaveBeenCalled(); // The changed view cancels the old callback, rather than marking the new message read.
  connection.emitWithAck.mockResolvedValueOnce({ ok: false, error: { message: "Denied" } });
  await act(async () => vi.advanceTimersByTime(300));
  expect(onRead).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Unable to update read status");
  connection.emitWithAck.mockResolvedValueOnce({ ok: true, data: { updated: 2 } });
  await act(async () => container.querySelector<HTMLButtonElement>("button[type=button]")!.click());
  await act(async () => vi.advanceTimersByTime(300));
  expect(onRead).toHaveBeenCalledWith(["viewed-1", "new-unread-2"]);
});

import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import BlogActivity from "@/modules/blogs/components/blog-activity";

vi.mock("@/modules/blogs/store/services/blogApi", () => ({
  useGetMyBlogAuditLogsQuery: () => ({
    currentData: {
      items: [{
        id: "audit-1",
        blogTitle: "Test story",
        action: "updated",
        createdAt: "2026-10-20T00:00:00Z",
      }],
      total: 1,
      totalPages: 1,
    },
    isFetching: false,
  }),
  useGetMyBlogAuditLogQuery: () => ({
    data: {
      blogTitle: "Test story",
      action: "updated",
      createdAt: "2026-10-20T00:00:00Z",
      changes: { title: { old: "Old title", new: "Test story" } },
      snapshot: null,
    },
    isLoading: false,
  }),
}));
vi.mock("@/lib/api/baseApi", () => ({ queryError: () => "Request failed" }));

it("keeps activity details open through Strict Mode effect cleanup and allows closing and reopening", async () => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // Browsers queue the native close event, including when effect cleanup closes a dialog.
  const originalShowModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype, "showModal",
  );
  const originalClose = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype, "close",
  );
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      if (!this.open) return;
      this.open = false;
      setTimeout(() => this.dispatchEvent(new Event("close")), 0);
    },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(
      <StrictMode><BlogActivity /></StrictMode>,
    ));
    const openDetails = async () => {
      await act(async () => {
        container.querySelector<HTMLButtonElement>(
          "button[aria-label^='View details']",
        )!.click();
      });
      await act(async () => vi.runAllTimers());
    };
    await openDetails();
    expect(container.querySelector("dialog")?.open).toBe(true);
    expect(container.querySelector("dialog")?.textContent).toContain("Old title");
    await act(async () => {
      container.querySelector<HTMLButtonElement>("dialog button")!.click();
    });
    await act(async () => vi.runAllTimers());
    expect(container.querySelector("dialog")).toBeNull();
    await openDetails();
    expect(container.querySelector("dialog")?.open).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    for (const [name, descriptor] of [
      ["showModal", originalShowModal], ["close", originalClose],
    ] as const) {
      if (descriptor)
        Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
    vi.useRealTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  }
});

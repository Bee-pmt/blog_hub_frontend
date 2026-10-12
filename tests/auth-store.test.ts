import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/type/type";
import { ApiError } from "@/lib/api";
import { createAuthStore } from "@/store/auth-store";
import { clearSessionAction, logoutAction, submitAuthAction } from "@/action/action";
import {
  authenticatedRequest,
  clearSession,
  refreshSession,
  setSession,
} from "@/lib/session";

vi.mock("@/action/action", () => ({
  submitAuthAction: vi.fn(),
  logoutAction: vi.fn(),
  clearSessionAction: vi.fn(),
}));
vi.mock("@/lib/session", () => ({
  authenticatedRequest: vi.fn(),
  clearSession: vi.fn(),
  refreshSession: vi.fn(),
  setSession: vi.fn(),
  sessionLock: (operation: () => Promise<unknown>) => operation(),
}));

const user: User = {
  id: "author", displayName: "Writer", email: "writer@test.local",
  role: "author", createdAt: "2026-10-12", updatedAt: "2026-10-12",
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(refreshSession).mockResolvedValue("access");
  vi.mocked(authenticatedRequest).mockResolvedValue(user);
  vi.mocked(logoutAction).mockResolvedValue({ error: "", status: 200 });
  vi.mocked(submitAuthAction).mockResolvedValue({
    data: { accessToken: "access", expiresIn: 3600 }, error: "", status: 200,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Zustand authentication store", () => {
  it("starts with consistent initial state and isolates provider instances", async () => {
    const first = createAuthStore();
    const second = createAuthStore();
    expect(first.getState()).toMatchObject({ user: null, loading: true, error: "" });
    expect(refreshSession).not.toHaveBeenCalled();
    await first.getState().restore();
    expect(first.getState()).toMatchObject({ user, loading: false, error: "" });
    expect(second.getState()).toMatchObject({ user: null, loading: true, error: "" });
  });

  it("logs in and clears only the current user's recovery copies on logout", async () => {
    const store = createAuthStore();
    const api = store.getState().api;
    await store.getState().login(new FormData());
    expect(setSession).toHaveBeenCalledWith({ accessToken: "access", expiresIn: 3600 });
    expect(store.getState()).toMatchObject({ user, loading: false });
    expect(store.getState().api).toBe(api);
    localStorage.setItem("bloghub-recovery:author:new", "draft");
    localStorage.setItem("bloghub-recovery:other:new", "other draft");
    await store.getState().logout();
    expect(store.getState()).toMatchObject({ user: null, loading: false, error: "" });
    expect(localStorage.getItem("bloghub-recovery:author:new")).toBeNull();
    expect(localStorage.getItem("bloghub-recovery:other:new")).toBe("other draft");
  });

  it("ignores a pending profile response after logout", async () => {
    let resolveProfile!: (value: User) => void;
    vi.mocked(authenticatedRequest).mockReturnValue(new Promise<User>((resolve) => {
      resolveProfile = resolve;
    }));
    const store = createAuthStore();
    const restoring = store.getState().restore();
    await vi.waitFor(() => expect(authenticatedRequest).toHaveBeenCalled());
    await store.getState().logout();
    resolveProfile(user);
    await restoring;
    expect(store.getState()).toMatchObject({ user: null, loading: false });
  });

  it("synchronizes tab events and closes the channel on cleanup", async () => {
    const channel = {
      onmessage: vi.fn<(event: MessageEvent) => void>(),
      postMessage: vi.fn(),
      close: vi.fn(),
    };
    vi.stubGlobal("BroadcastChannel", vi.fn(function () { return channel; }));
    const store = createAuthStore();
    const cleanup = store.getState().initialize();
    await vi.waitFor(() => expect(store.getState().user).toEqual(user));
    await store.getState().login(new FormData());
    expect(channel.postMessage).toHaveBeenCalledWith("login");
    channel.onmessage(new MessageEvent("message", { data: "logout" }));
    expect(store.getState()).toMatchObject({ user: null, loading: false, error: "" });
    channel.onmessage(new MessageEvent("message", { data: "login" }));
    await vi.waitFor(() => expect(store.getState().user).toEqual(user));
    cleanup();
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it("preserves the signed-in user when backend logout fails", async () => {
    const store = createAuthStore();
    await store.getState().restore();
    vi.mocked(logoutAction).mockResolvedValue({ error: "Temporary failure", status: 503 });
    await expect(store.getState().logout()).rejects.toThrow("Temporary failure");
    expect(store.getState().user).toEqual(user);
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("keeps the user on request errors and clears them on a final 401", async () => {
    const store = createAuthStore();
    await store.getState().restore();
    vi.mocked(authenticatedRequest).mockRejectedValue(new ApiError("Unavailable", 503));
    await expect(store.getState().api("/blogs")).rejects.toMatchObject({ status: 503 });
    expect(store.getState().user).toEqual(user);
    vi.mocked(authenticatedRequest).mockRejectedValue(new ApiError("Expired", 401));
    await expect(store.getState().api("/blogs")).rejects.toMatchObject({ status: 401 });
    expect(store.getState().user).toBeNull();
    expect(clearSession).toHaveBeenCalled();
  });
});


describe("Password change sessions", () => {
  it("keeps the account signed in when the current password is incorrect", async () => {
    const store = createAuthStore();
    await store.getState().restore();
    vi.mocked(authenticatedRequest).mockRejectedValueOnce(new ApiError("Current password is incorrect", 401));
    await expect(store.getState().changePassword("wrong", "newpassword123")).rejects.toMatchObject({ status: 401 });
    expect(store.getState().user).toEqual(user);
    expect(clearSessionAction).not.toHaveBeenCalled();
    expect(authenticatedRequest).toHaveBeenLastCalledWith("/auth/change-password", "POST", {
      body: JSON.stringify({ currentPassword: "wrong", newPassword: "newpassword123" }),
    }, false);
  });

  it("clears frontend cookies, memory, and account recovery after a successful change", async () => {
    const store = createAuthStore();
    await store.getState().restore();
    localStorage.setItem("bloghub-recovery:author:new", "draft");
    await store.getState().changePassword("password123", "newpassword123");
    expect(clearSessionAction).toHaveBeenCalledOnce();
    expect(clearSession).toHaveBeenCalled();
    expect(store.getState().user).toBeNull();
    expect(localStorage.getItem("bloghub-recovery:author:new")).toBeNull();
    expect(logoutAction).not.toHaveBeenCalled();
  });
});

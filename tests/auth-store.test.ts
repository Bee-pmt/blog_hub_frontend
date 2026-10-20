import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createAppStore } from "@/lib/store";
import {
  loginAuth,
  restoreAuth,
  logoutAuth,
  sessionEnded,
  changePasswordAuth,
} from "@/modules/auth/store/slices/authSlice";
import {
  authenticatedRequest,
  refreshSession,
  clearSession,
} from "@/lib/session";
import {
  submitAuthAction,
  logoutAction,
  clearSessionAction,
} from "@/modules/auth/actions";
import { ApiError } from "@/lib/api-client";
import { completeGoogleAction } from "@/modules/auth/google-actions";
import { googleLoginAuth } from "@/modules/auth/store/slices/authSlice";
vi.mock("@/modules/auth/google-actions", () => ({
  completeGoogleAction: vi.fn(),
}));
vi.mock("@/modules/auth/actions", () => ({
  submitAuthAction: vi.fn(),
  logoutAction: vi.fn(),
  clearSessionAction: vi.fn(),
}));
vi.mock("@/lib/session", () => ({
  authenticatedRequest: vi.fn(),
  refreshSession: vi.fn(),
  clearSession: vi.fn(),
  setSession: vi.fn(),
  sessionLock: (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/content-client", () => ({ contentRequest: vi.fn() }));
const user = {
  id: "author",
  displayName: "Writer",
  email: "writer@test.local",
  role: "author",
  createdAt: "2026-10-14",
  updatedAt: "2026-10-14",
};
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(refreshSession).mockResolvedValue("access");
  vi.mocked(authenticatedRequest).mockResolvedValue(user);
  vi.mocked(submitAuthAction).mockResolvedValue({
    data: { accessToken: "access", expiresIn: 3600 },
    error: "",
    status: 200,
  });
  vi.mocked(logoutAction).mockResolvedValue({ error: "", status: 200 });
});
afterEach(() => vi.clearAllMocks());
describe("Redux authentication", () => {
  it("uses the existing Redux session for a successful Google login", async () => {
    vi.mocked(completeGoogleAction).mockResolvedValue({
      data: { accessToken: "google-app-access", expiresIn: 3600 },
      linked: false,
      returnTo: "/dashboard",
      error: "",
      status: 200,
    });
    const store = createAppStore();
    await store.dispatch(googleLoginAuth(new FormData())).unwrap();
    expect(store.getState().auth.user).toEqual(user);
    expect(store.getState().auth.loading).toBe(false);
  });
  it("creates isolated stores and restores the current account", async () => {
    const first = createAppStore(),
      second = createAppStore();
    await first.dispatch(restoreAuth()).unwrap();
    expect(first.getState().auth).toMatchObject({
      user,
      loading: false,
      error: "",
    });
    expect(second.getState().auth.user).toBeNull();
  });
  it("treats a missing/expired session as signed out", async () => {
    vi.mocked(refreshSession).mockRejectedValue(new ApiError("Expired", 401));
    const store = createAppStore();
    await store.dispatch(restoreAuth()).unwrap();
    expect(store.getState().auth).toMatchObject({
      user: null,
      loading: false,
      error: "",
    });
  });
  it("keeps a restoration failure visible for retry", async () => {
    vi.mocked(refreshSession).mockRejectedValue(new ApiError("Offline", 0));
    const store = createAppStore();
    await store.dispatch(restoreAuth());
    expect(store.getState().auth.error).toBe("Offline");
  });
  it("ignores a profile response arriving after sign-out", async () => {
    let done!: (value: unknown) => void;
    vi.mocked(authenticatedRequest).mockReturnValue(
      new Promise((resolve) => {
        done = resolve;
      }),
    );
    const store = createAppStore();
    const pending = store.dispatch(restoreAuth());
    await vi.waitFor(() => expect(authenticatedRequest).toHaveBeenCalled());
    store.dispatch(sessionEnded());
    done(user);
    await pending;
    expect(store.getState().auth.user).toBeNull();
  });
  it("logs in and removes only the account's recovery copies after logout", async () => {
    const store = createAppStore();
    await store.dispatch(loginAuth(new FormData())).unwrap();
    localStorage.setItem("bloghub-recovery:author:new", "draft");
    localStorage.setItem("bloghub-recovery:other:new", "other");
    await store.dispatch(logoutAuth()).unwrap();
    expect(store.getState().auth.user).toBeNull();
    expect(localStorage.getItem("bloghub-recovery:author:new")).toBeNull();
    expect(localStorage.getItem("bloghub-recovery:other:new")).toBe("other");
  });
  it("keeps the account signed in when logout or current-password verification fails", async () => {
    const store = createAppStore();
    await store.dispatch(restoreAuth()).unwrap();
    vi.mocked(logoutAction).mockResolvedValue({
      error: "Unavailable",
      status: 503,
    });
    await expect(store.dispatch(logoutAuth()).unwrap()).rejects.toMatchObject({
      message: "Unavailable",
    });
    vi.mocked(authenticatedRequest).mockRejectedValue(
      new ApiError("Current password is incorrect", 401),
    );
    await expect(
      store
        .dispatch(
          changePasswordAuth({
            currentPassword: "bad",
            newPassword: "newpassword123",
          }),
        )
        .unwrap(),
    ).rejects.toMatchObject({ message: "Current password is incorrect" });
    expect(store.getState().auth.user).toEqual(user);
    expect(clearSession).not.toHaveBeenCalled();
  });
  it("clears the session after a successful password change", async () => {
    const store = createAppStore();
    await store.dispatch(restoreAuth()).unwrap();
    await store
      .dispatch(
        changePasswordAuth({
          currentPassword: "old",
          newPassword: "newpassword123",
        }),
      )
      .unwrap();
    expect(clearSessionAction).toHaveBeenCalledOnce();
    expect(store.getState().auth.user).toBeNull();
  });
});

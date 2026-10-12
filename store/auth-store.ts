"use client";

import { createStore } from "zustand/vanilla";
import type { Auth } from "@/type/type";
import { ApiError, errorMessage, getCurrentUser } from "@/lib/api";
import {
  authenticatedRequest,
  clearSession,
  refreshSession,
  sessionLock,
  setSession,
} from "@/lib/session";
import { logoutAction, submitAuthAction } from "@/action/action";

// Each provider creates its own store; session restoration starts after mounting.
export function createAuthStore() {
  let restoreId = 0;
  let channel: BroadcastChannel | null = null;

  return createStore<Auth>()((set, get) => ({
    user: null,
    loading: true,
    error: "",

    async restore() {
      const id = ++restoreId;
      set({ loading: true, error: "" });
      try {
        await refreshSession();
        const user = await getCurrentUser(authenticatedRequest);
        if (id === restoreId) set({ user });
      } catch (failure) {
        if (id !== restoreId) return;
        if (failure instanceof ApiError && failure.status === 401) {
          clearSession();
          set({ user: null });
        } else set({ error: errorMessage(failure) });
      } finally {
        if (id === restoreId) set({ loading: false });
      }
    },

    async login(form) {
      ++restoreId;
      await sessionLock(async () => {
        const result = await submitAuthAction("login", form);
        if (!result.data) throw new ApiError(result.error, result.status);
        clearSession();
        setSession(result.data);
        set({ user: await getCurrentUser(authenticatedRequest) });
      });
      set({ loading: false, error: "" });
      channel?.postMessage("login");
    },

    async logout() {
      await sessionLock(async () => {
        const result = await logoutAction();
        if (result.error) throw new ApiError(result.error, result.status);
      });
      ++restoreId;
      const userId = get().user?.id;
      clearSession();
      set({ user: null, loading: false, error: "" });
      try {
        for (const key of Object.keys(localStorage))
          if (key.startsWith(`bloghub-recovery:${userId}:`))
            localStorage.removeItem(key);
      } catch {
        /* Storage can be unavailable. */
      }
      channel?.postMessage("logout");
    },

    async api<T>(path: string, options?: RequestInit): Promise<T> {
      try {
        return await authenticatedRequest<T>(path, options);
      } catch (failure) {
        if (failure instanceof ApiError && failure.status === 401) {
          clearSession();
          set({ user: null });
        }
        throw failure;
      }
    },

    initialize() {
      void get().restore();
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel("bloghub-session");
        channel.onmessage = (event) => {
          if (event.data === "logout") {
            ++restoreId;
            clearSession();
            set({ user: null, loading: false, error: "" });
          }
          if (event.data === "login") void get().restore();
        };
      }
      return () => {
        ++restoreId;
        channel?.close();
        channel = null;
      };
    },
  }));
}

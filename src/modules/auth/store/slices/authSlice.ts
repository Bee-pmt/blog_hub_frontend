import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { User } from "@/modules/users/types";
import { completeGoogleAction } from "../../google-actions";
import { ApiError } from "@/lib/api-client";
import { getCurrentUser } from "@/modules/auth/api";
import {
  authenticatedRequest,
  clearSession,
  refreshSession,
  sessionLock,
  setSession,
} from "@/lib/session";
import {
  clearSessionAction,
  logoutAction,
  submitAuthAction,
} from "@/modules/auth/actions";

let channel: BroadcastChannel | null = null;
export function setAuthChannel(value: BroadcastChannel | null) {
  channel = value;
}

export const restoreAuth = createAsyncThunk("auth/restore", async () => {
  try {
    await refreshSession();
    return await getCurrentUser(authenticatedRequest);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearSession();
      return null;
    }
    throw error;
  }
});
export const loginAuth = createAsyncThunk(
  "auth/login",
  async (form: FormData) => {
    const user = await sessionLock(async () => {
      const result = await submitAuthAction("login", form);
      if (!result.data) throw new ApiError(result.error, result.status);
      clearSession();
      setSession(result.data);
      return getCurrentUser(authenticatedRequest);
    });
    channel?.postMessage("login");
    return user;
  },
);
export const googleLoginAuth = createAsyncThunk("auth/google", async (form: FormData) => {
  const user = await sessionLock(async () => {
    const result = await completeGoogleAction(form);
    if (!result.data) throw new ApiError(result.error || "Unable to sign in with Google.", result.status);
    clearSession();
    setSession(result.data);
    return getCurrentUser(authenticatedRequest);
  });
  channel?.postMessage("login");
  return user;
});
export const endAuth = createAsyncThunk(
  "auth/end",
  async (_, { getState, dispatch }) => {
    try {
      await clearSessionAction();
    } finally {
      const userId = (getState() as { auth: AuthState }).auth.user?.id;
      clearSession();
      dispatch(sessionEnded());
      try {
        for (const key of Object.keys(localStorage))
          if (key.startsWith(`bloghub-recovery:${userId}:`))
            localStorage.removeItem(key);
      } catch {
        /* Storage can be unavailable. */
      }
      channel?.postMessage("logout");
    }
  },
);
export const logoutAuth = createAsyncThunk(
  "auth/logout",
  async (_, { dispatch }) => {
    await sessionLock(async () => {
      const result = await logoutAction();
      if (result.error) throw new ApiError(result.error, result.status);
    });
    await dispatch(endAuth()).unwrap();
  },
);
export const changePasswordAuth = createAsyncThunk(
  "auth/changePassword",
  async (
    input: { currentPassword: string; newPassword: string },
    { dispatch },
  ) => {
    // A wrong current password also returns 401; it must not clear the session.
    await authenticatedRequest(
      "/auth/change-password",
      "POST",
      { body: JSON.stringify(input) },
      false,
    );
    await dispatch(endAuth()).unwrap();
  },
);

type AuthState = {
  user: User | null;
  loading: boolean;
  error: string;
  requestId: string | null;
};
const initialState: AuthState = {
  user: null,
  loading: true,
  error: "",
  requestId: null,
};
const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    sessionEnded(state) {
      state.user = null;
      state.loading = false;
      state.error = "";
      state.requestId = null;
    },
  },
  extraReducers(builder) {
    for (const operation of [restoreAuth, loginAuth, googleLoginAuth]) {
      builder.addCase(operation.pending, (state, action) => {
        state.loading = true;
        state.error = "";
        state.requestId = action.meta.requestId;
      });
      builder.addCase(operation.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        state.user = action.payload;
        state.loading = false;
        state.error = "";
        state.requestId = null;
      });
      builder.addCase(operation.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        state.loading = false;
        state.requestId = null;
        state.error =
          operation === restoreAuth
            ? action.error.message || "Unable to restore your session."
            : "";
      });
    }
  },
});
export const { sessionEnded } = authSlice.actions;
export default authSlice.reducer;

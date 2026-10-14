"use client";
import { useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import {
  restoreAuth,
  loginAuth,
  logoutAuth,
  endAuth,
  changePasswordAuth,
} from "../store/slices/authSlice";

// Keep authentication actions together; Redux owns the account state.
export function useAuth() {
  const state = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const actions = useMemo(
    () => ({
      restore: () => dispatch(restoreAuth()).unwrap(),
      login: (form: FormData) => dispatch(loginAuth(form)).unwrap(),
      logout: () => dispatch(logoutAuth()).unwrap(),
      endSession: () => dispatch(endAuth()).unwrap(),
      changePassword: (currentPassword: string, newPassword: string) =>
        dispatch(changePasswordAuth({ currentPassword, newPassword })).unwrap(),
    }),
    [dispatch],
  );
  return { ...state, ...actions };
}

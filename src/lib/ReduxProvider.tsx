"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { createAppStore } from "./store";
import {
  restoreAuth,
  refreshProfile,
  sessionEnded,
  setAuthChannel,
} from "@/modules/auth/store/slices/authSlice";
import { clearSession } from "./session";
import ChatProvider from "@/modules/chat/components/chat-provider";

export default function ReduxProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createAppStore);
  useEffect(() => {
    void store.dispatch(restoreAuth());
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("bloghub-session")
        : null;
    setAuthChannel(channel);
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === "logout") {
          clearSession();
          store.dispatch(sessionEnded());
        }
        if (event.data === "login") void store.dispatch(restoreAuth());
      };
    const refreshAccess = () => {
      if (store.getState().auth.user) void store.dispatch(refreshProfile());
    };
    window.addEventListener("focus", refreshAccess);
    return () => {
      window.removeEventListener("focus", refreshAccess);
      channel?.close();
      setAuthChannel(null);
      store.dispatch(sessionEnded());
    };
  }, [store]);
  return <Provider store={store}><ChatProvider>{children}</ChatProvider></Provider>;
}

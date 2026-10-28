"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { API_BASE, errorMessage } from "@/lib/api-client";
import { refreshSession, withAccessToken } from "@/lib/session";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { useAppDispatch } from "@/lib/store/hooks";
import type { MessageDeleted } from "../types";
import { chatApi, useGetUnreadChatCountQuery } from "../store/services/chatApi";

const ChatContext = createContext<{
  socket: Socket;
  connectionError: string;
  reconnect: () => Promise<void>;
  unreadCount?: number;
  deletions: Record<string, string>;
  applyDeletion: (event: MessageDeleted) => void;
} | null>(null);

export function useChatConnection() {
  const chat = useContext(ChatContext);
  if (!chat) throw new Error("ChatProvider is required");
  return chat;
}

export function UnreadChatBadge() {
  const { unreadCount } = useChatConnection();
  return (
    <span aria-live="polite" aria-atomic="true">
      {!!unreadCount && (
        <span className="chat-unread-count" aria-label={`${unreadCount} unread messages`}>
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </span>
  );
}

// Keep the socket and its current authentication callback together across page changes.
function createChatConnection() {
  let authenticate: ((callback: (data: { accessToken: string }) => void) => void) | null = null;
  const socket = io(`${new URL(API_BASE).origin}/chat`, {
    transports: ["websocket"],
    autoConnect: false,
    auth: (callback) => authenticate?.(callback),
  });
  return {
    socket,
    setAuthenticate(callback: typeof authenticate) { authenticate = callback; },
  };
}

export default function ChatProvider({ children }: { children: ReactNode }) {
  const { user, loading, error } = useAuth();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const active = !!user && !loading && !error &&
    (pathname === "/dashboard" || pathname.startsWith("/dashboard/"));
  const [connection] = useState(createChatConnection);
  const { socket } = connection;
  const [connectionError, setConnectionError] = useState("");
  const owner = `${user?.id || ""}:${user?.role || ""}`;
  const [deletionState, setDeletionState] = useState({ owner, messages: {} as Record<string, string> });
  if (deletionState.owner !== owner) setDeletionState({ owner, messages: {} });
  const applyDeletion = useCallback((event: MessageDeleted) => {
    setDeletionState((previous) => previous.owner !== owner || previous.messages[event.messageId]
      ? previous
      : { owner, messages: { ...previous.messages, [event.messageId]: event.deletedAt } });
    dispatch(chatApi.util.invalidateTags([
      "Conversation", { type: "ChatMessage", id: event.conversationId },
    ]));
  }, [owner, dispatch]);
  const generation = useRef(0);
  const { currentData } = useGetUnreadChatCountQuery(undefined, {
    skip: !active,
    pollingInterval: 30_000,
    refetchOnMountOrArgChange: true,
  });

  useEffect(() => {
    if (!active) return;
    let listening = true;
    const lifecycle = generation;
    lifecycle.current++;
    connection.setAuthenticate((callback) => {
      void withAccessToken(async (accessToken) => {
        if (listening) callback({ accessToken });
      }).catch(() => {
        if (listening) setConnectionError("Unable to authenticate chat. Reconnect or sign in again.");
      });
    });
    const refreshConversations = () => {
      if (listening) dispatch(chatApi.util.invalidateTags(["Conversation"]));
    };
    const messageDeleted = (event: MessageDeleted) => {
      if (listening) applyDeletion(event);
    };
    const connected = () => {
      setConnectionError("");
      dispatch(chatApi.util.invalidateTags(["Conversation", "ChatMessage"]));
    };
    const connectError = () => {
      setConnectionError("Unable to connect to chat. Check your connection and try again.");
    };
    const disconnected = (reason: string) => {
      // A server disconnect after token expiry needs fresh credentials and a new handshake.
      if (reason !== "io server disconnect") return;
      void refreshSession().then(() => {
        if (listening) socket.connect();
      }).catch(() => {
        if (listening) setConnectionError("Unable to authenticate chat. Please sign in again.");
      });
    };
    socket.on("connect", connected);
    socket.on("connect_error", connectError);
    socket.on("disconnect", disconnected);
    socket.on("message:new", refreshConversations);
    socket.on("message:read", refreshConversations);
    socket.on("message:deleted", messageDeleted);
    window.addEventListener("focus", refreshConversations);
    socket.connect();
    return () => {
      listening = false;
      lifecycle.current++;
      connection.setAuthenticate(null);
      socket.off("connect", connected);
      socket.off("connect_error", connectError);
      socket.off("disconnect", disconnected);
      socket.off("message:new", refreshConversations);
      socket.off("message:read", refreshConversations);
      socket.off("message:deleted", messageDeleted);
      window.removeEventListener("focus", refreshConversations);
      socket.disconnect();
    };
  }, [active, user?.id, user?.role, socket, connection, dispatch, applyDeletion]);

  async function reconnect() {
    const attempt = generation.current;
    setConnectionError("");
    try {
      await refreshSession();
      if (active && generation.current === attempt) socket.disconnect().connect();
    } catch (error) {
      if (generation.current === attempt) setConnectionError(errorMessage(error));
    }
  }

  return (
    <ChatContext.Provider value={{ socket, connectionError, reconnect, unreadCount: active ? currentData?.unreadCount : undefined, deletions: deletionState.owner === owner ? deletionState.messages : {}, applyDeletion }}>
      {children}
    </ChatContext.Provider>
  );
}

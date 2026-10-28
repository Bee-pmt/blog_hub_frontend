"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useChatConnection } from "./chat-provider";
import type { ChatMessage } from "../types";

type SendReply =
  | { ok: true; data: { message: ChatMessage; created: boolean } }
  | { ok: false; error: { code: string; message: string } };

export default function MessageComposer({
  conversationId,
  onSent,
  onReceived,
  onConnected,
  readMessageIds = [],
  onRead,
  onReadReceipt,
  recipientName,
}: {
  conversationId: string;
  onSent: (message: ChatMessage) => void;
  onReceived: (message: ChatMessage) => void;
  onConnected: () => void;
  readMessageIds?: string[];
  onRead?: (ids: string[]) => void;
  onReadReceipt?: () => void;
  recipientName?: string;
}) {
  const { socket: connection, connectionError, reconnect } = useChatConnection();
  const socket = useRef<typeof connection | null>(connection);
  const pending = useRef<{ conversationId: string; clientMessageId: string; content: string } | null>(null);
  const busy = useRef(false);
  const typing = useRef(false);
  const lastTyping = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [content, setContent] = useState("");
  const [connected, setConnected] = useState(connection.connected);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [readError, setReadError] = useState("");
  const [readRetry, setReadRetry] = useState(0);
  // Socket events use the latest callbacks without reconnecting on each render.
  const received = useEffectEvent(onReceived);
  const ready = useEffectEvent(onConnected);
  const readReceipt = useEffectEvent(() => onReadReceipt?.());
  const confirmRead = useEffectEvent((ids: string[]) => onRead?.(ids));
  const readKey = readMessageIds.join("|");

  useEffect(() => {
    let active = true;
    socket.current = connection;
    const onConnect = () => {
      setConnected(true);
      setError("");
      ready();
    };
    const onMessage = (message: ChatMessage) => {
      if (active) received(message);
    };
    const onReceipt = (receipt: { conversationId: string; updated: number }) => {
      if (active && receipt.conversationId === conversationId && receipt.updated > 0) readReceipt();
    };
    const onTypingStart = (event: { conversationId: string }) => {
      if (!active || event.conversationId !== conversationId) return;
      setOtherTyping(true);
      if (remoteTimer.current) clearTimeout(remoteTimer.current);
      remoteTimer.current = setTimeout(() => setOtherTyping(false), 5000);
    };
    const onTypingStop = (event: { conversationId: string }) => {
      if (event.conversationId !== conversationId) return;
      if (remoteTimer.current) clearTimeout(remoteTimer.current);
      setOtherTyping(false);
    };
    const onDisconnect = () => {
      setConnected(false);
      setOtherTyping(false);
      typing.current = false;
      if (stopTimer.current) clearTimeout(stopTimer.current);
      if (remoteTimer.current) clearTimeout(remoteTimer.current);
    };
    connection.on("connect", onConnect);
    connection.on("message:new", onMessage);
    connection.on("message:read", onReceipt);
    connection.on("typing:start", onTypingStart);
    connection.on("typing:stop", onTypingStop);
    connection.on("disconnect", onDisconnect);
    // Catch a connection that completed between rendering and subscribing.
    queueMicrotask(() => {
      if (!active) return;
      setConnected(connection.connected);
      if (connection.connected) ready();
    });
    return () => {
      active = false;
      if (typing.current && connection.connected)
        connection.emit("typing:stop", { conversationId });
      if (stopTimer.current) clearTimeout(stopTimer.current);
      if (remoteTimer.current) clearTimeout(remoteTimer.current);
      socket.current = null;
      connection.off("connect", onConnect);
      connection.off("message:new", onMessage);
      connection.off("message:read", onReceipt);
      connection.off("typing:start", onTypingStart);
      connection.off("typing:stop", onTypingStop);
      connection.off("disconnect", onDisconnect);
    };
  }, [conversationId, connection]);

  useEffect(() => {
    if (!connected || !readKey) return;
    const connection = socket.current;
    let active = true;
    let inFlight = false;
    async function markRead() {
      if (!active || inFlight || !connection?.connected || document.visibilityState !== "visible" || !document.hasFocus()) return;
      inFlight = true;
      try {
        const reply: { ok: boolean; error?: { message: string } } = await connection.timeout(10000)
          .emitWithAck("message:read", { conversationId });
        if (!active) return;
        if (!reply.ok) throw new Error(reply.error?.message || "Unable to mark messages read.");
        setReadError("");
        confirmRead(readKey.split("|"));
      } catch {
        if (active) setReadError("Unable to update read status.");
      } finally {
        inFlight = false;
      }
    }
    const timer = setTimeout(() => void markRead(), 300);
    const onFocus = () => void markRead();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [connected, readKey, conversationId, readRetry]);

  function stopTyping() {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (typing.current && socket.current?.connected)
      socket.current.emit("typing:stop", { conversationId });
    typing.current = false;
  }

  function updateTyping(text: string) {
    if (!text.trim()) return stopTyping();
    if (!socket.current?.connected) return;
    if (!typing.current || Date.now() - lastTyping.current > 3000) {
      socket.current.emit("typing:start", { conversationId });
      typing.current = true;
      lastTyping.current = Date.now();
    }
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(stopTyping, 1200);
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const connection = socket.current;
    if (busy.current || !connection?.connected || !content.trim()) return;
    if (Array.from(content).length > 2000) {
      setError("Messages must be 2,000 characters or fewer.");
      return;
    }
    // Keep the same ID and text after a timeout: the server may already have saved it.
    stopTyping();
    pending.current ??= { conversationId, clientMessageId: crypto.randomUUID(), content };
    busy.current = true;
    setSending(true);
    setError("");
    try {
      const reply: SendReply = await connection.timeout(10000).emitWithAck("message:send", pending.current);
      if (socket.current !== connection) return;
      if (!reply.ok) {
        setError(reply.error.message);
        return;
      }
      pending.current = null;
      setContent("");
      onSent(reply.data.message);
    } catch {
      if (socket.current === connection)
        setError("Delivery could not be confirmed. Send again to retry safely.");
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <form className="chat-composer" onSubmit={sendMessage}>
      <p className="muted" role="status">
        {connected ? "Chat connected" : "Chat disconnected"}
        {!connected && <> · <button className="text-link" type="button" onClick={() => void reconnect()}>Reconnect</button></>}
      </p>
      {otherTyping && <p className="muted" role="status">{recipientName || "The other participant"} is typing…</p>}
      {readError && <p className="notice" role="alert">{readError} <button type="button" className="text-link" onClick={() => setReadRetry(readRetry + 1)}>Retry read status</button></p>}
      {(error || connectionError) && <p className="notice" role="alert">{error || connectionError}</p>}
      <label htmlFor="chat-message">Message</label>
      <textarea
        id="chat-message"
        rows={2}
        value={content}
        disabled={sending}
        placeholder="Write a message…"
        onChange={(event) => {
          pending.current = null;
          setContent(event.target.value);
          updateTyping(event.target.value);
        }}
        onBlur={stopTyping}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <button className="button" disabled={!connected || sending || !content.trim()}>
        {sending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}

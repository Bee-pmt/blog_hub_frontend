"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ConfirmDialog from "@/modules/base/components/confirm-dialog";
import { errorMessage } from "@/lib/api-client";
import { useChatConnection } from "./chat-provider";
import { queryError } from "@/lib/api/baseApi";
import { chatApi, useGetMessagesQuery } from "../store/services/chatApi";
import { useAppDispatch } from "@/lib/store/hooks";
import type { ChatMessage, Conversation, MessageDeleted, MessagePage } from "../types";
import MessageComposer from "./message-composer";

export default function MessageHistory({
  conversation,
  userId,
  onBack,
}: {
  conversation: Conversation;
  userId: string;
  onBack: () => void;
}) {
  const { socket, deletions, applyDeletion } = useChatConnection();
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<MessagePage[]>([]);
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const dispatch = useAppDispatch();
  const [atBottom, setAtBottom] = useState(true);
  const [receiptError, setReceiptError] = useState("");
  const alive = useRef(false);
  const receiptRequest = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const {
    currentData: data,
    error,
    isFetching,
    refetch,
  } = useGetMessagesQuery(
    {
      conversationId: conversation.id,
      page,
    },
    { refetchOnMountOrArgChange: true },
  );
  const scroll = useRef<HTMLDivElement>(null);
  const position = useRef<"bottom" | { height: number; top: number } | null>(
    "bottom",
  );

  useLayoutEffect(() => {
    const panel = scroll.current?.closest<HTMLElement>(".chat-history");
    const layout = panel?.closest<HTMLElement>(".chat-layout");
    if (!panel || !layout) return;
    const heading =
      layout.parentElement?.querySelector<HTMLElement>(".chat-page-heading");
    const header = document.querySelector<HTMLElement>(".site-header");
    const viewport = window.visualViewport;

    function fitChat() {
      const viewportTop = viewport?.offsetTop || 0;
      const viewportBottom =
        viewportTop + (viewport?.height || window.innerHeight);
      const headerBottom = header?.getBoundingClientRect().bottom || 0;
      // Subtract the panel's actual position, including the Messages/Refresh row.
      const top = Math.max(
        layout!.getBoundingClientRect().top,
        headerBottom,
        viewportTop,
      );
      layout!.style.setProperty(
        "--chat-height",
        `${Math.max(0, viewportBottom - top - 12)}px`,
      );
    }
    fitChat();
    const observer = new ResizeObserver(fitChat);
    if (heading) observer.observe(heading);
    if (header) observer.observe(header);
    window.addEventListener("resize", fitChat);
    window.addEventListener("scroll", fitChat, { passive: true });
    viewport?.addEventListener("resize", fitChat);
    viewport?.addEventListener("scroll", fitChat);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fitChat);
      window.removeEventListener("scroll", fitChat);
      viewport?.removeEventListener("resize", fitChat);
      viewport?.removeEventListener("scroll", fitChat);
    };
  }, []);

  // Keep earlier pages when the query loads another page or retries it.
  if (data && pages[page - 1] !== data) {
    const updated = [...pages];
    updated[page - 1] = data;
    setPages(updated);
  }
  const unique = new Map<string, ChatMessage>();
  for (const message of [
    ...pages.flatMap((item) => item.items),
    ...liveMessages,
  ]) {
    const previous = unique.get(message.id);
    const deletedAt = deletions[message.id] || previous?.deletedAt || message.deletedAt;
    unique.set(message.id, {
      ...message,
      isRead: previous?.isRead || message.isRead,
      ...(deletedAt ? { content: null, deletedAt } : {}),
    });
  }
  const messages = Array.from(unique.values()).sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  const totalPages =
    data?.totalPages ?? pages[pages.length - 1]?.totalPages ?? 0;
  const unavailable =
    error &&
    "status" in error &&
    (error.status === 403 || error.status === 404);

  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element || !data || isFetching || !position.current) return;
    if (position.current === "bottom") element.scrollTop = element.scrollHeight;
    else
      element.scrollTop =
        position.current.top + element.scrollHeight - position.current.height;
    position.current = null;
  }, [data, isFetching, pages, liveMessages]);

  function receiveMessage(message: ChatMessage) {
    if (message.conversationId !== conversation.id) return;
    if (messages.some((item) => item.id === message.id)) return;
    const element = scroll.current;
    // Leave readers in place when they have scrolled up to older messages.
    if (
      element &&
      element.scrollHeight - element.scrollTop - element.clientHeight < 80
    )
      position.current = "bottom";
    setLiveMessages((messages) =>
      messages.some((item) => item.id === message.id)
        ? messages
        : [...messages, message],
    );
  }

  async function refreshReadStatus() {
    const request = ++receiptRequest.current;
    try {
      const history = await Promise.all(
        Array.from({ length: page }, (_, index) =>
          dispatch(
            chatApi.endpoints.getMessages.initiate(
              { conversationId: conversation.id, page: index + 1 },
              { subscribe: false, forceRefetch: true },
            ),
          ).unwrap(),
        ),
      );
      if (!alive.current || request !== receiptRequest.current) return;
      const canonical = new Map(
        history
          .flatMap((item) => item.items)
          .map((message) => [message.id, message]),
      );
      setPages(history);
      setLiveMessages((messages) =>
        messages.map((message) => canonical.get(message.id) || message),
      );
      setReceiptError("");
    } catch {
      if (alive.current && request === receiptRequest.current)
        setReceiptError("Unable to refresh read status.");
    }
  }

  async function deleteMessage() {
    if (!deleteTarget || deleting) return;
    setDeleteError("");
    setDeleting(true);
    try {
      if (!socket.connected) throw new Error("Chat is disconnected. Reconnect before deleting a message.");
      const reply: { ok: true; data: MessageDeleted } | { ok: false; error: { message: string } } =
        await socket.timeout(10000).emitWithAck("message:delete", { messageId: deleteTarget.id });
      if (!alive.current) return;
      if (!reply.ok) throw new Error(reply.error.message);
      applyDeletion(reply.data);
    } catch (error) {
      if (alive.current) setDeleteError(`Unable to delete this message. ${errorMessage(error)}`);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  function loadOlder() {
    if (!scroll.current) return;
    position.current = {
      height: scroll.current.scrollHeight,
      top: scroll.current.scrollTop,
    };
    setPage(page + 1);
  }

  return (
    <section
      className="chat-history"
      aria-label={`Conversation with ${conversation.otherUser.displayName}`}
    >
      <div className="chat-history-heading">
        <button
          className="chat-close"
          type="button"
          aria-label="Close conversation"
          title="Close conversation"
          onClick={onBack}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
        <div className="chat-recipient">
          <span className="conversation-avatar" aria-hidden="true">
            {Array.from(
              conversation.otherUser.displayName.trim(),
            )[0]?.toLocaleUpperCase() || "U"}
          </span>
          <h2>{conversation.otherUser.displayName}</h2>
        </div>
      </div>
      <div
        className="chat-history-scroll"
        ref={scroll}
        role="region"
        aria-label="Message history"
        tabIndex={0}
        onScroll={(event) => {
          const element = event.currentTarget;
          setAtBottom(
            element.scrollHeight - element.scrollTop - element.clientHeight < 3,
          );
        }}
      >
        {page < totalPages && (
          <button
            className="text-link chat-load-older"
            disabled={isFetching || !!error}
            onClick={loadOlder}
          >
            Load older messages
          </button>
        )}
        {isFetching && (
          <p className="chat-history-status" role="status">
            Loading messages…
          </p>
        )}
        {error && (
          <div className="notice" role="alert">
            {queryError(error)}{" "}
            <button className="text-link" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        )}
        {!isFetching && !error && !messages.length && (
          <p className="empty-state">No messages yet.</p>
        )}
        <ol className="chat-message-list" aria-label="Messages">
          {(unavailable ? [] : messages).map((message) => (
            <li
              key={message.id}
              data-message-id={message.id}
              className={`chat-message ${message.senderId === userId ? "chat-message-outgoing" : "chat-message-incoming"}`}
            >
              <span className="sr-only">
                {message.senderId === userId
                  ? "You"
                  : conversation.otherUser.displayName}
                :
              </span>
              <p className={message.deletedAt ? "chat-message-deleted" : undefined}>
                {message.deletedAt ? "This message was deleted." : message.content}
              </p>
              <time
                dateTime={message.createdAt}
                title={new Date(message.createdAt).toLocaleString()}
              >
                {new Date(message.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
              {message.senderId === userId && !message.deletedAt && (
                <span className="chat-read-status">
                  {message.isRead ? "Read" : "Sent"}
                </span>
              )}
              {message.senderId === userId && !message.deletedAt && (
                <button type="button" className="text-link chat-delete-message"
                  aria-label="Delete message" title="Delete message" disabled={deleting}
                  onClick={() => { setDeleteError(""); setDeleteTarget(message); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                    strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
      {deleteTarget && (
        <ConfirmDialog title="Delete this message?" confirmLabel="Delete for everyone"
          message="The message text will be removed for both participants. A deleted-message placeholder will remain."
          busy={deleting} onCancel={() => setDeleteTarget(null)} onConfirm={() => void deleteMessage()} />
      )}
      {deleteError && <p className="notice" role="alert">{deleteError}</p>}
      {receiptError && (
        <p className="notice" role="alert">
          {receiptError}{" "}
          <button
            className="text-link"
            onClick={() => void refreshReadStatus()}
          >
            Retry read status
          </button>
        </p>
      )}
      {!unavailable && (
        <MessageComposer
          conversationId={conversation.id}
          recipientName={conversation.otherUser.displayName}
          readMessageIds={
            atBottom && data && !isFetching
              ? messages
                  .filter(
                    (message) => message.senderId !== userId && !message.isRead && !message.deletedAt,
                  )
                  .map((message) => message.id)
              : []
          }
          onRead={(ids) => {
            const read = new Set(ids);
            const update = (message: ChatMessage) =>
              read.has(message.id) ? { ...message, isRead: true } : message;
            setLiveMessages((live) => {
              const updated = new Map(
                live.map((message) => [message.id, update(message)]),
              );
              for (const message of messages) {
                if (read.has(message.id))
                  updated.set(message.id, update(message));
              }
              return Array.from(updated.values());
            });
            dispatch(chatApi.util.invalidateTags(["Conversation"]));
          }}
          onReadReceipt={() => void refreshReadStatus()}
          onSent={(message) => {
            position.current = "bottom";
            setLiveMessages((messages) => [...messages, message]);
            dispatch(chatApi.util.invalidateTags(["Conversation"]));
          }}
          onReceived={receiveMessage}
          onConnected={() => {
            // Start from recent history again: events can be missed while offline.
            setPage(1);
            setPages([]);
            setLiveMessages([]);
            position.current = "bottom";
          }}
        />
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { queryError } from "@/lib/api/baseApi";
import { useCreateConversationMutation, useGetConversationsQuery } from "../store/services/chatApi";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import type { Conversation } from "../types";
import MessageHistory from "../components/message-history";

export default function ConversationsPage() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { user } = useAuth();
  const [started, setStarted] = useState<{ ownerId: string; conversation: Conversation } | null>(null);
  const [createConversation, { isLoading: creating, error: createError }] = useCreateConversationMutation();
  const {
    currentData: data,
    error,
    isFetching,
    refetch,
  } = useGetConversationsQuery(page);
  const selected = data?.items.find(
    (conversation) => conversation.id === selectedId,
  ) || (started?.ownerId === user?.id && started?.conversation.id === selectedId ? started.conversation : null);

  if (data && !isFetching && page > Math.max(1, data.totalPages))
    setPage(Math.max(1, data.totalPages));

  return (
    <div className={`chat-page${selected ? " chat-page-active" : ""}`}>
      <div className="section-heading chat-page-heading">
        <div>
          {!selected && <p className="eyebrow">Your inbox</p>}
          <h1>Messages</h1>
        </div>
      </div>
      {!selected && <p className="muted">Your private conversations.</p>}
      {!selected && (
        <>
          <form className="chat-start" onSubmit={async (event) => {
            event.preventDefault();
            if (creating) return;
            const form = event.currentTarget;
            const recipientId = String(new FormData(form).get("recipientId") || "").trim();
            try {
              const conversation = await createConversation(recipientId).unwrap();
              if (!user) return;
              setStarted({ ownerId: user.id, conversation });
              setSelectedId(conversation.id);
              setPage(1);
              form.reset();
            } catch { /* RTK Query displays the backend error below. */ }
          }}>
            <label htmlFor="chat-recipient-id">Recipient user ID</label>
            <input id="chat-recipient-id" name="recipientId" required placeholder="Paste the recipient’s user ID" />
            <button className="button button-secondary" disabled={creating}>{creating ? "Opening…" : "Start conversation"}</button>
            {createError && <p className="notice" role="alert">{queryError(createError)}</p>}
          </form>
          <p className="muted">Your user ID: <code>{user?.id}</code></p>
        </>
      )}
      <div className={`chat-layout${selected ? " chat-has-selection" : ""}`}>
        <section className="chat-conversations" aria-label="Conversation list">
          {error ? (
            <div className="notice" role="alert">
              {queryError(error)}{" "}
              <button className="text-link" onClick={() => void refetch()}>
                Try again
              </button>
            </div>
          ) : !data ? (
            <p className="loading-state" role="status">
              Loading conversations…
            </p>
          ) : (
            <>
              <p className="result-count" role="status">
                {data.total}{" "}
                {data.total === 1 ? "conversation" : "conversations"}
              </p>
              {data.items.length ? (
                <ul className="conversation-list" aria-label="Conversations">
                  {data.items.map((conversation) => (
                    <li
                      className={
                        conversation.unreadCount ? "conversation-unread" : ""
                      }
                      key={conversation.id}
                    >
                      <button
                        className="conversation-row conversation-select"
                        aria-label={`Open conversation with ${conversation.otherUser.displayName}`}
                        aria-pressed={selectedId === conversation.id}
                        onClick={() => setSelectedId(conversation.id)}
                      >
                        <span
                          className="conversation-avatar"
                          aria-hidden="true"
                        >
                          {Array.from(
                            conversation.otherUser.displayName.trim(),
                          )[0]?.toLocaleUpperCase() || "U"}
                        </span>
                        <span className="conversation-body">
                          <span className="conversation-heading">
                            <span className="conversation-name">
                              {conversation.otherUser.displayName}
                            </span>
                            {conversation.lastMessage && (
                              <time
                                dateTime={conversation.lastMessage.createdAt}
                                title={new Date(
                                  conversation.lastMessage.createdAt,
                                ).toLocaleString()}
                              >
                                {new Date(
                                  conversation.lastMessage.createdAt,
                                ).toLocaleString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </time>
                            )}
                          </span>
                          <span className="conversation-preview">
                            {conversation.lastMessage?.content ||
                              "No messages yet."}
                          </span>
                        </span>
                        {conversation.unreadCount > 0 && (
                          <span
                            className="conversation-count"
                            aria-label={`${conversation.unreadCount} unread messages`}
                          >
                            {conversation.unreadCount > 99
                              ? "99+"
                              : conversation.unreadCount}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-state">
                  <h2>No conversations yet.</h2>
                  <p>Your conversations will appear here.</p>
                </div>
              )}
              {data.totalPages > 1 && (
                <nav className="pagination" aria-label="Conversation pages">
                  <button
                    disabled={page <= 1 || isFetching}
                    onClick={() => {
                      setSelectedId(null);
                      setPage(page - 1);
                    }}
                  >
                    Previous
                  </button>
                  <span>
                    Page {page} of {data.totalPages}
                  </span>
                  <button
                    disabled={page >= data.totalPages || isFetching}
                    onClick={() => {
                      setSelectedId(null);
                      setPage(page + 1);
                    }}
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
        {selected && user && (
          <MessageHistory
            key={`${user.id}:${selected.id}`}
            conversation={selected}
            userId={user.id}
            onBack={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

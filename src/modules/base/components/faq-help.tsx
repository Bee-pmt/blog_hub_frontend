"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api-client";
import {
  faqRequest, FaqRateLimitError,
  type FaqAnswer, type FaqCategory, type FaqDetail, type FaqSuggestion,
} from "../faq-api";

type Message = { role: "user" | "support"; text: string; suggestions?: FaqSuggestion[] };

function FaqSuggestions({ items, disabled, onChoose }: {
  items: FaqSuggestion[];
  disabled: boolean;
  onChoose: (item: FaqSuggestion) => void;
}) {
  return <div className="faq-suggestions">{items.map((item) => (
    <button key={item.id} type="button" className="button button-secondary"
      disabled={disabled} onClick={() => onChoose(item)}>{item.question}</button>
  ))}</div>;
}

export default function FaqHelp() {
  const panel = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const questionRequest = useRef<AbortController | null>(null);
  const categoryRequest = useRef<AbortController | null>(null);
  const suggestionRequest = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const started = useRef(false);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "support", text: "Welcome to BlogHub Help. Choose a suggested question or ask about BlogHub. Answers come from our predefined help topics." },
  ]);
  const [categories, setCategories] = useState<FaqCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [suggestions, setSuggestions] = useState<FaqSuggestion[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [suggestionError, setSuggestionError] = useState("");
  const [error, setError] = useState("");
  const [blockedUntil, setBlockedUntil] = useState(0);

  useEffect(() => () => {
    questionRequest.current?.abort();
    categoryRequest.current?.abort();
    suggestionRequest.current?.abort();
  }, []);

  useEffect(() => {
    if (!blockedUntil) return;
    const timer = setTimeout(() => {
      setBlockedUntil(0);
      setError("");
    }, Math.max(0, blockedUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [blockedUntil]);

  useEffect(() => {
    if (open && nearBottom.current && history.current)
      history.current.scrollTop = history.current.scrollHeight;
  }, [open, messages, busy, suggestions]);

  function requestError(failure: unknown) {
    if (failure instanceof FaqRateLimitError) {
      setBlockedUntil((current) => Math.max(current, failure.retryAt));
      setError(failure.message);
    }
    return errorMessage(failure);
  }

  async function loadCategories() {
    if (blockedUntil) return;
    categoryRequest.current?.abort();
    const controller = new AbortController();
    categoryRequest.current = controller;
    setCategoryLoading(true);
    setCategoryError("");
    try {
      const data = await faqRequest<FaqCategory[]>("/categories", { signal: controller.signal });
      if (!controller.signal.aborted) setCategories(data);
    } catch (failure) {
      if (!controller.signal.aborted) setCategoryError(requestError(failure));
    } finally {
      if (!controller.signal.aborted) setCategoryLoading(false);
    }
  }

  async function loadSuggestions(id: string) {
    if (blockedUntil) return;
    suggestionRequest.current?.abort();
    const controller = new AbortController();
    suggestionRequest.current = controller;
    setSuggestionLoading(true);
    setSuggestionError("");
    setSuggestions([]);
    try {
      const query = new URLSearchParams({ limit: "5" });
      if (id) query.set("categoryId", id);
      const data = await faqRequest<FaqSuggestion[]>(`/suggestions?${query}`, { signal: controller.signal });
      if (!controller.signal.aborted) setSuggestions(data);
    } catch (failure) {
      if (!controller.signal.aborted) setSuggestionError(requestError(failure));
    } finally {
      if (!controller.signal.aborted) setSuggestionLoading(false);
    }
  }

  function showHelp() {
    if (!panel.current?.open) panel.current?.showModal();
    setOpen(true);
    input.current?.focus();
    if (!started.current) {
      started.current = true;
      void loadCategories();
      void loadSuggestions("");
    }
  }

  async function ask(suggestion?: FaqSuggestion) {
    if (pending.current || blockedUntil) return;
    const text = (suggestion?.question ?? question).trim();
    if (!text || text.length > 500 || !/[\p{L}\p{N}]/u.test(text)) {
      setError("Use 1–500 characters containing at least one letter or number.");
      return;
    }
    pending.current = true;
    const controller = new AbortController();
    questionRequest.current = controller;
    setBusy(true);
    setError("");
    setMessages((current) => [...current, { role: "user", text }]);
    try {
      if (suggestion) {
        const detail = await faqRequest<FaqDetail>(`/${encodeURIComponent(suggestion.id)}`, { signal: controller.signal });
        if (!controller.signal.aborted)
          setMessages((current) => [...current, { role: "support", text: detail.answer }]);
      } else {
        const answer = await faqRequest<FaqAnswer>("/ask", { method: "POST", body: { question: text }, signal: controller.signal });
        if (!controller.signal.aborted) {
          setMessages((current) => [...current, { role: "support", text: answer.answer, suggestions: answer.suggestions }]);
          setQuestion("");
        }
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        const message = requestError(failure);
        if (!(failure instanceof FaqRateLimitError)) setError(message);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      pending.current = false;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask();
  }

  return (
    <>
      <button ref={trigger} className="faq-trigger" type="button" aria-label="Help" title="BlogHub Help"
        aria-haspopup="dialog" aria-expanded={open} aria-controls="bloghub-help" onClick={showHelp}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 13v-1a8 8 0 0 1 16 0v1M4 13H3v6h4v-6H4Zm16 0h1v6h-4v-6h3Zm0 6v1a2 2 0 0 1-2 2h-5" />
        </svg>
      </button>
      <dialog ref={panel} id="bloghub-help" className="faq-panel" aria-labelledby="faq-title"
        onClose={() => { setOpen(false); trigger.current?.focus(); }}>
        <header className="faq-heading">
          <h2 id="faq-title">BlogHub Help</h2>
          <button className="text-link faq-close" type="button" aria-label="Close help" onClick={() => panel.current?.close()}>×</button>
        </header>
        <div className="faq-filter">
          <label>Help category
            <select className="form-control" value={categoryId} disabled={categoryLoading || !!blockedUntil}
              onChange={(event) => { setCategoryId(event.target.value); void loadSuggestions(event.target.value); }}>
              <option value="">All topics</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          {categoryLoading && <p role="status">Loading categories…</p>}
          {categoryError && <p className="notice" role="alert">{categoryError}{" "}<button className="text-link" disabled={categoryLoading || !!blockedUntil} onClick={() => void loadCategories()}>Retry categories</button></p>}
        </div>
        <div className="faq-messages" ref={history} onScroll={() => {
          if (history.current) nearBottom.current = history.current.scrollHeight - history.current.scrollTop - history.current.clientHeight < 80;
        }}>
          <div className="faq-topics" aria-label="Suggested questions">
            {suggestionLoading ? <p role="status">Loading suggested questions…</p> : suggestionError ? (
              <p className="notice" role="alert">{suggestionError}{" "}<button className="text-link" disabled={!!blockedUntil} onClick={() => void loadSuggestions(categoryId)}>Retry suggestions</button></p>
            ) : suggestions.length ? <FaqSuggestions items={suggestions} disabled={busy || !!blockedUntil} onChoose={ask} /> : <p className="muted">No suggested questions in this category. You can still type a question.</p>}
          </div>
          <ol className="faq-history" role="log" aria-label="FAQ conversation" aria-live="polite" aria-relevant="additions text">
            {messages.map((message, index) => (
              <li key={index} className={`faq-message faq-message-${message.role}`}>
                <span className="sr-only">{message.role === "user" ? "You" : "BlogHub Help"}: </span>
                <p>{message.text}</p>
                {!!message.suggestions?.length && <FaqSuggestions items={message.suggestions} disabled={busy || !!blockedUntil} onChoose={ask} />}
              </li>
            ))}
          </ol>
          {busy && <p role="status">Looking up your question…</p>}
        </div>
        <form className="faq-form" onSubmit={submit}>
          {error && <p className="notice" role="alert">{error}</p>}
          <div className="faq-input-row">
            <label className="sr-only" htmlFor="faq-question">Ask a question</label>
            <input ref={input} id="faq-question" className="form-control" value={question} maxLength={500} required
              placeholder="Ask about BlogHub…" disabled={busy || !!blockedUntil} onChange={(event) => setQuestion(event.target.value)} />
            <button className="button button-primary" type="submit" disabled={busy || !!blockedUntil}>{busy ? "Sending…" : "Send"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

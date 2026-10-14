"use client";
import { useCallback, useEffect, useRef } from "react";
import type { Draft, Recovery } from "@/modules/blogs/types";

function parseRecovery(value: string | null): Recovery | null {
  try {
    const copy = JSON.parse(value || "null");
    const draft = copy?.draft;
    if (
      draft &&
      typeof draft.title === "string" &&
      typeof draft.content === "string" &&
      typeof draft.categoryId === "string" &&
      typeof draft.coverImageUrl === "string" &&
      Array.isArray(draft.tagIds) &&
      draft.tagIds.every((id: unknown) => typeof id === "string") &&
      typeof copy.savedAt === "string" &&
      Number.isFinite(Date.parse(copy.savedAt))
    )
      return copy;
  } catch {
    /* Invalid recovery data is ignored. */
  }
  return null;
}

// Browser recovery and leave warnings are separate from the editor's form and API state.
export function useDraftRecovery({
  storageKey,
  draft,
  dirty,
  waitingForRecovery,
  baseUpdatedAt,
  onError,
}: {
  storageKey: string;
  draft: Draft;
  dirty: boolean;
  waitingForRecovery: boolean;
  baseUpdatedAt: string | null;
  onError: (message: string) => void;
}) {
  const leaveAllowed = useRef(false);
  const persistRecovery = useCallback(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          draft,
          savedAt: new Date().toISOString(),
          baseUpdatedAt,
        }),
      );
    } catch {
      onError("Browser recovery is unavailable. Save your work regularly.");
    }
  }, [storageKey, draft, baseUpdatedAt, onError]);
  const readRecovery = useCallback(
    (initial: Draft) => {
      try {
        const copy = parseRecovery(localStorage.getItem(storageKey));
        return copy && JSON.stringify(copy.draft) !== JSON.stringify(initial)
          ? copy
          : null;
      } catch {
        onError("Browser recovery is unavailable. Save your work regularly.");
        return null;
      }
    },
    [storageKey, onError],
  );
  const clearRecovery = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* Storage unavailable. */
    }
  }, [storageKey]);
  useEffect(() => {
    leaveAllowed.current = false;
  }, [storageKey]);
  useEffect(() => {
    if (!dirty || waitingForRecovery || leaveAllowed.current) return;
    const timer = setTimeout(persistRecovery, 1000);
    return () => clearTimeout(timer);
  }, [dirty, waitingForRecovery, persistRecovery]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (leaveAllowed.current) return;
      persistRecovery();
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      if (leaveAllowed.current || event.defaultPrevented || event.button !== 0)
        return;
      const link = (event.target as Element).closest(
        "a[href]",
      ) as HTMLAnchorElement | null;
      const signingOut = (event.target as Element).closest(
        "[data-leave-editor]",
      );
      if (
        !signingOut &&
        (!link ||
          link.target === "_blank" ||
          link.hasAttribute("download") ||
          (link.pathname === window.location.pathname &&
            link.search === window.location.search))
      )
        return;
      if (
        !window.confirm(
          "You have unsaved changes. Leave this story? Your browser recovery copy will remain.",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      } else persistRecovery();
    };
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    const traverse = (event: Event) => {
      const change = event as Event & {
        navigationType?: string;
        destination?: { url: string };
      };
      if (
        leaveAllowed.current ||
        change.navigationType !== "traverse" ||
        !event.cancelable
      )
        return;
      if (
        change.destination &&
        new URL(change.destination.url).pathname === window.location.pathname
      )
        return;
      if (
        !window.confirm(
          "You have unsaved changes. Leave this story? Your browser recovery copy will remain.",
        )
      )
        event.preventDefault();
      else persistRecovery();
    };
    navigation?.addEventListener("navigate", traverse);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      navigation?.removeEventListener("navigate", traverse);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty, persistRecovery]);
  const allowLeave = useCallback(() => {
    leaveAllowed.current = true;
  }, []);
  return { allowLeave, readRecovery, persistRecovery, clearRecovery };
}

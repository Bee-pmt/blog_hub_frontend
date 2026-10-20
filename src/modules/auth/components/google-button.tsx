"use client";

import { useEffect, useState } from "react";
import { startGoogleAction } from "../google-actions";
import { authenticatedRequest } from "@/lib/session";
import { useAuth } from "../hooks/useAuth";

export default function GoogleButton({ link = false }: { link?: boolean }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linked, setLinked] = useState(false);
  useEffect(() => {
    if (!link || !user) return;
    let active = true;
    authenticatedRequest<{ linked: boolean }>("/auth/google/status")
      .then((status) => {
        if (active) setLinked(status.linked);
      })
      .catch(() => {
        /* The user can still retry linking if the status request fails. */
      });
    return () => {
      active = false;
    };
  }, [link, user]);
  if (linked)
    return (
      <p className="notice" role="status">
        Google is linked. You can sign in with Google or your password.
      </p>
    );
  return (
    <form
      className="stack google-signin"
      action={async () => {
        if (busy) return;
        setBusy(true);
        setError("");
        const form = new FormData();
        form.set("mode", link ? "link" : "login");
        form.set(
          "returnTo",
          link
            ? "/settings"
            : new URLSearchParams(window.location.search).get("returnTo") ||
                "/dashboard",
        );
        try {
          const result = await startGoogleAction(form);
          setError(result.error);
        } finally {
          setBusy(false);
        }
      }}
    >
      <button
        className="button button-secondary google-button"
        type="submit"
        disabled={busy}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.23c1.89-1.74 2.99-4.3 2.99-7.36Z"
          />
          <path
            fill="#34A853"
            d="M12 22c2.7 0 4.96-.9 6.61-2.41l-3.23-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.13H3.07v2.59A10 10 0 0 0 12 22Z"
          />
          <path
            fill="#FBBC05"
            d="M6.41 13.91a6 6 0 0 1 0-3.82V7.5H3.07a10 10 0 0 0 0 9l3.34-2.59Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.96c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.5l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z"
          />
        </svg>
        {busy
          ? "Opening Google…"
          : link
            ? "Link Google"
            : "Continue with Google"}
      </button>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

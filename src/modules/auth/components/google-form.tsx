"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TextField from "@/modules/base/components/TextField";
import { errorMessage } from "@/lib/api-client";
import { withAccessToken } from "@/lib/session";
import { useAuth } from "../hooks/useAuth";
import { completeGoogleAction } from "../google-actions";

export default function GoogleForm({
  step,
  email,
  displayName,
  mode,
  returnTo,
}: {
  step: "login" | "link" | "register";
  email: string;
  displayName: string;
  mode: string;
  returnTo: string;
}) {
  const { completeGoogle, user, loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const linking = mode === "link";
  const registering = !linking && step === "register";
  const needsPassword = linking || step !== "login";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (registering) {
        const password = String(form.get("password") || "");
        if (
          [...password].length < 8 ||
          new TextEncoder().encode(password).length > 72
        )
          throw new Error(
            "Use at least 8 characters and no more than 72 UTF-8 bytes.",
          );
        if (password !== form.get("confirmPassword"))
          throw new Error("Passwords do not match.");
      }
      if (linking) {
        const result = await withAccessToken(
          (token) => completeGoogleAction(form, token),
          false,
        );
        if (result.error) throw new Error(result.error);
        toast.success("Google account linked.");
        router.replace("/settings");
      } else {
        await completeGoogle(form);
        toast.success(
          registering
            ? "Your account is ready."
            : "Signed in with Google.",
        );
        router.replace(returnTo);
      }
      router.refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main-content" className="site-container account-page">
      <div className="account-intro">
        <p className="eyebrow">Continue with Google</p>
        <h1>
          {registering
            ? "Complete your account."
            : needsPassword
              ? "Link your Google account."
              : "Welcome back."}
        </h1>
        <p className="muted">
          {registering
            ? "Set a password so you can also sign in with your email. Your account is created when you finish."
            : needsPassword
              ? "Confirm your BlogHub password once. Future Google sign-ins won’t ask for it."
              : "Your Google account is linked. Continue to your stories."}
        </p>
      </div>
      <div className="card account-card">
        <h2>{displayName}</h2>
        <p className="muted">{email}</p>
        {linking && (loading || !user) ? (
          <p className="notice">
            {loading
              ? "Checking your session…"
              : "Your BlogHub session expired. Sign in, then link Google from settings again."}
          </p>
        ) : (
          <form className="stack" onSubmit={handleSubmit}>
            <fieldset disabled={busy} className="stack password-fields">
              {needsPassword && (
                <TextField
                  label={
                    registering ? "Create password" : "Current BlogHub password"
                  }
                  name="password"
                  type="password"
                  autoComplete={
                    registering ? "new-password" : "current-password"
                  }
                  minLength={registering ? 8 : 1}
                  required
                />
              )}
              {registering && (
                <>
                  <p className="field-help">
                    At least 8 characters, up to 72 UTF-8 bytes.
                  </p>
                  <TextField
                    label="Confirm password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </>
              )}
              {needsPassword && !registering && (
                <p className="field-help">
                  {linking
                    ? `Linking to ${user?.email}. The Google email must match.`
                    : "Your existing account, stories, and role stay the same."}
                </p>
              )}
              <button className="button button-primary" type="submit">
                {busy
                  ? "Please wait…"
                  : registering
                    ? "Create account and sign in"
                    : needsPassword
                      ? "Confirm password and link Google"
                      : "Sign in with Google"}
              </button>
            </fieldset>
            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
          </form>
        )}
        {needsPassword && !registering && (
          <p className="account-switch">
            <Link href="/forgot-password">Forgot your password?</Link>
          </p>
        )}
        <p className="account-switch">
          <Link href={linking ? "/settings" : "/login"}>Cancel</Link>
        </p>
      </div>
    </main>
  );
}

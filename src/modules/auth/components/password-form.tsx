"use client";

import { useForm } from "react-hook-form";
import TextField from "@/modules/base/components/TextField";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api-client";
import { passwordRecoveryAction } from "@/modules/auth/actions";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import GoogleButton from "./google-button";

export default function PasswordForm({ mode }: { mode: "change" | "forgot" }) {
  const {
    user,
    loading,
    error: sessionError,
    restore,
    changePassword,
    endSession,
  } = useAuth();
  const { register, handleSubmit, reset } = useForm<{
    email: string;
    currentPassword: string;
    code: string;
    newPassword: string;
    confirmPassword: string;
  }>({ shouldUnregister: true });
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const change = mode === "change";
  const passwordFields = change || codeSent;

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  return (
    <main id="main-content" className="site-container account-page">
      <div className="account-intro">
        <p className="eyebrow">Account security</p>
        <h1>{change ? "A fresh password." : "Find your way back."}</h1>
        <p className="muted">
          {change
            ? "Keep your account secure with a password only you know."
            : "We’ll send a verification code to the email address you registered with."}
        </p>
        <p className="field-help">
          After changing your password, sign in again on each of your devices.
        </p>
      </div>
      <div className="card account-card">
        <h2>
          {change
            ? "Change password"
            : codeSent
              ? "Reset password"
              : "Forgot password?"}
        </h2>
        {change && loading ? (
          <p role="status">Checking your session…</p>
        ) : change && sessionError ? (
          <div className="notice" role="alert">
            {sessionError}{" "}
            <button className="text-link" onClick={() => void restore()}>
              Retry session check
            </button>
          </div>
        ) : change && !user ? (
          <>
            <p className="muted">Sign in to change your password.</p>
            <Link
              className="button button-primary"
              href="/login?returnTo=%2Fsettings"
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            {notice && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}
            <form
              className="stack"
              onSubmit={handleSubmit(async (values) => {
                if (busy) return;
                const form = new FormData();
                for (const [key, value] of Object.entries(values))
                  form.set(key, value);
                setError("");
                const newPassword = String(form.get("newPassword") || "");
                if (passwordFields) {
                  if (
                    [...newPassword].length < 8 ||
                    new TextEncoder().encode(newPassword).length > 72
                  ) {
                    setError(
                      "Use at least 8 characters and no more than 72 UTF-8 bytes.",
                    );
                    return;
                  }
                  if (newPassword !== form.get("confirmPassword")) {
                    setError("Passwords do not match.");
                    return;
                  }
                }
                setBusy(true);
                try {
                  if (change) {
                    await changePassword(
                      String(form.get("currentPassword") || ""),
                      newPassword,
                    );
                  } else {
                    const result = await passwordRecoveryAction(
                      codeSent ? "reset" : "forgot",
                      form,
                    );
                    if (result.error) throw new Error(result.error);
                    if (!codeSent) {
                      setEmail(
                        String(form.get("email") || "")
                          .trim()
                          .toLowerCase(),
                      );
                      setNotice(result.message);
                      setCodeSent(true);
                      setCooldown(60);
                      return;
                    }
                    await endSession();
                  }
                  reset();
                  toast.success(
                    "Password updated. Please sign in with your new password.",
                  );
                  router.replace("/login");
                  router.refresh();
                } catch (failure) {
                  setError(errorMessage(failure));
                } finally {
                  setBusy(false);
                }
              })}
            >
              <fieldset disabled={busy} className="stack password-fields">
                {!change && (
                  <label>
                    Email
                    <input
                      className="form-control"
                      {...register("email")}
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      key={codeSent ? "registered-email" : "email"}
                      defaultValue={email}
                      readOnly={codeSent}
                    />
                  </label>
                )}
                {change && (
                  <TextField
                    label="Current password"
                    className="form-control"
                    {...register("currentPassword")}
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                )}
                {!change && codeSent && (
                  <>
                    <label>
                      Verification code
                      <input
                        className="form-control verification-code"
                        {...register("code")}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        minLength={6}
                        maxLength={6}
                        required
                        aria-describedby="code-help"
                      />
                    </label>
                    <p id="code-help" className="field-help">
                      Enter the six-digit code from your email. It expires after
                      15 minutes. Check your spam folder too.
                    </p>
                  </>
                )}
                {passwordFields && (
                  <>
                    <TextField
                      label="New password"
                      className="form-control"
                      {...register("newPassword")}
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                      aria-describedby="password-help"
                    />
                    <p id="password-help" className="field-help">
                      At least 8 characters, up to 72 UTF-8 bytes.
                    </p>
                    <TextField
                      label="Confirm new password"
                      className="form-control"
                      {...register("confirmPassword")}
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </>
                )}
              </fieldset>
              {error && (
                <p className="notice" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button button-primary"
                type="submit"
                disabled={busy}
              >
                {busy
                  ? "Please wait…"
                  : change
                    ? "Change password"
                    : codeSent
                      ? "Reset password"
                      : "Send verification code"}
              </button>
            </form>
            {!change && codeSent && (
              <div className="password-recovery-actions">
                <button
                  className="text-link"
                  disabled={busy || cooldown > 0}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const form = new FormData();
                      form.set("email", email);
                      const result = await passwordRecoveryAction(
                        "forgot",
                        form,
                      );
                      if (result.error) throw new Error(result.error);
                      setNotice(result.message);
                      setCooldown(60);
                    } catch (failure) {
                      setError(errorMessage(failure));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {cooldown ? `Resend code in ${cooldown}s` : "Resend code"}
                </button>
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() => {
                    setCodeSent(false);
                    setError("");
                    setNotice("");
                  }}
                >
                  Use a different email
                </button>
              </div>
            )}
          </>
        )}
        <p className="account-switch">
          <Link className="text-link" href={change ? "/dashboard" : "/login"}>
            {change ? "Back to your workspace" : "Back to sign in"}
          </Link>
        </p>
        {change && user && !loading && (
          <section className="google-settings">
            <h2>Google sign-in</h2>
            <p className="field-help">Link Google with your current password once. Your email and password login will keep working.</p>
            <GoogleButton link />
          </section>
        )}
      </div>
    </main>
  );
}

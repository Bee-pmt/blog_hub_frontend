"use client";
import type { AuthFormProps } from "@/type/type";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { errorMessage, localReturnPath } from "@/lib/api";
import { submitAuthAction } from "@/action/action";
import { useAuth } from "./auth-provider";
export default function AuthForm({ mode }: AuthFormProps) {
  const { login, user, loading, error: sessionError, restore } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);
  const register = mode === "register";
  
  return (
    <main id="main-content" className="site-container account-page">
      <div className="account-intro">
        <p className="eyebrow">Your next chapter</p>
        <h1>{register ? "Make room for your ideas." : "Welcome back."}</h1>
        <p className="muted">
          {register
            ? "Join a community of thoughtful readers and writers."
            : "A story is waiting to be written."}
        </p>
      </div>
      <div className="card account-card">
        {registered ? (
          <div role="status">
            <h2>You’re ready to write.</h2>
            <p>Your account has been created. Sign in to get started.</p>
            <Link className="button button-primary" href="/login">
              Continue to sign in
            </Link>
          </div>
        ) : user && !loading ? (
          <>
            <h2>Signed in as {user.displayName}</h2>
            <Link className="button button-primary" href="/dashboard">
              Go to profile
            </Link>
          </>
        ) : (
          <>
            <h2>{register ? "Create an account" : "Sign in"}</h2>
            {sessionError && (
              <div className="notice" role="alert">
                {sessionError}{" "}
                <button className="text-link" onClick={() => void restore()}>
                  Retry session check
                </button>
              </div>
            )}
            <form
              className="stack"
              action={async (form) => {
                if (busy) return;
                setError("");
                setBusy(true);
                try {
                  if (register) {
                    const result = await submitAuthAction("register", form);
                    if (result.error) {
                      setError(result.error);
                      toast.error(result.error);
                      return;
                    }
                    setRegistered(true);
                    toast.success("Your account has been created. Sign in to get started.");
                  } else {
                    await login(form);
                    toast.success("Signed in successfully.");
                    router.replace(
                      localReturnPath(
                        new URLSearchParams(window.location.search).get(
                          "returnTo",
                        ),
                      ),
                    );
                    router.refresh();
                  }
                } catch (failure) {
                  setError(errorMessage(failure));
                  toast.error(errorMessage(failure));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {register && (
                <label>
                  Display name
                  <input
                    className="form-control"
                    name="displayName"
                    required
                    maxLength={100}
                    autoComplete="nickname"
                  />
                </label>
              )}
              <label>
                Email
                <input
                  className="form-control"
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                />
              </label>
              <label>
                Password
                <input
                  className="form-control"
                  name="password"
                  type="password"
                  required
                  minLength={register ? 8 : 1}
                  autoComplete={register ? "new-password" : "current-password"}
                />
              </label>
              {!register && (
                <Link className="text-link forgot-password-link" href="/forgot-password">
                  Forgot password?
                </Link>
              )}
              {register && (
                <p className="field-help">
                  At least 8 characters, up to 72 UTF-8 bytes.
                </p>
              )}
              {error && (
                <p className="notice" role="alert">
                  {error}
                </p>
              )}
              <button
                disabled={busy}
                className="button button-primary"
                type="submit"
              >
                {busy
                  ? "Please wait…"
                  : register
                    ? "Create account"
                    : "Sign in"}
              </button>
            </form>
            <p className="account-switch">
              {register ? "Already have an account?" : "New to BlogHub?"}{" "}
              <Link
                className="text-link"
                href={register ? "/login" : "/register"}
              >
                {register ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

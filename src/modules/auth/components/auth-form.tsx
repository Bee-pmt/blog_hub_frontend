"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import TextField from "@/modules/base/components/TextField";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/api-client";
import { localReturnPath } from "@/modules/auth/api";
import { submitAuthAction } from "@/modules/auth/actions";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import GoogleButton from "./google-button";

type AuthFormProps = { mode: "login" | "register" };

export default function AuthForm({ mode }: AuthFormProps) {
  const {
    login,
    user,
    loading: sessionLoading,
    error: sessionError,
    restore: restoreSession,
  } = useAuth();
  const { register, handleSubmit } = useForm<{
    displayName: string;
    email: string;
    password: string;
  }>();

  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const isRegister = mode === "register";

  async function submit(values: {
    displayName: string;
    email: string;
    password: string;
  }) {
    if (isSubmitting) return;

    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) formData.set(key, value);
    setIsSubmitting(true);
    setError("");

    try {
      if (isRegister) {
        const result = await submitAuthAction("register", formData);
        if (result.error) throw new Error(result.error);

        setIsRegistered(true);
        toast.success("Your account has been created. Sign in to get started.");
      } else {
        await login(formData);
        toast.success("Signed in successfully.");

        const params = new URLSearchParams(window.location.search);
        const returnTo = localReturnPath(params.get("returnTo"));
        router.replace(returnTo);
        router.refresh();
      }
    } catch (failure) {
      const message = errorMessage(failure);
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="site-container account-page">
      <div className="account-intro">
        <p className="eyebrow">Your next chapter</p>
        <h1>{isRegister ? "Make room for your ideas." : "Welcome back."}</h1>
        <p className="muted">
          {isRegister
            ? "Join a community of thoughtful readers and writers."
            : "A story is waiting to be written."}
        </p>
      </div>
      <div className="card account-card ">
        {isRegistered ? (
          <div role="status">
            <h2>You’re ready to write.</h2>
            <p>Your account has been created. Sign in to get started.</p>
            <Link className="button button-primary" href="/login">
              Continue to sign in
            </Link>
          </div>
        ) : user && !sessionLoading ? (
          <>
            <h2>Signed in as {user.displayName}</h2>
            <Link className="button button-primary" href="/dashboard">
              Go to profile
            </Link>
          </>
        ) : (
          <>
            <h2>{isRegister ? "Create an account" : "Sign in"}</h2>
            {sessionError && (
              <div className="notice" role="alert">
                {sessionError}{" "}
                <button
                  className="text-link"
                  onClick={() => void restoreSession()}
                >
                  Retry session check
                </button>
              </div>
            )}
            <form className="stack" onSubmit={handleSubmit(submit)}>
              {isRegister && (
                <TextField
                  label="Display name"
                  {...register("displayName")}
                  required
                  maxLength={100}
                  autoComplete="nickname"
                />
              )}
              <TextField
                label="Email"
                {...register("email")}
                type="email"
                required
                maxLength={254}
                autoComplete="email"
              />
              <TextField
                label="Password"
                {...register("password")}
                type="password"
                required
                minLength={isRegister ? 8 : 1}
                autoComplete={isRegister ? "new-password" : "current-password"}
              />
              {!isRegister && (
                <Link
                  className="text-link forgot-password-link"
                  href="/forgot-password"
                >
                  Forgot password?
                </Link>
              )}
              {isRegister && (
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
                disabled={isSubmitting}
                className="button button-primary"
                type="submit"
              >
                {isSubmitting
                  ? "Please wait…"
                  : isRegister
                    ? "Create account"
                    : "Sign in"}
              </button>
            </form>
            <p className="google-divider">or</p>
            <GoogleButton />
            <p className="account-switch">
              {isRegister ? "Already have an account?" : "New to BlogHub?"}{" "}
              <Link
                className="text-link"
                href={isRegister ? "/login" : "/register"}
              >
                {isRegister ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

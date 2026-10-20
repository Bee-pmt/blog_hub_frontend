"use server";

import { cookies } from "next/headers";
import {
  API_BASE,
  ApiError,
  apiWrapper,
  errorMessage,
  unwrapApiResult,
} from "@/lib/api-client";
import { localReturnPath } from "./api";
import { finishGoogleSession } from "./actions";
import { clearGoogleHandoff, readGoogleHandoff, signIn } from "./google";

export async function startGoogleAction(form: FormData) {
  if (
    !process.env.AUTH_SECRET ||
    !process.env.AUTH_GOOGLE_ID ||
    !process.env.AUTH_GOOGLE_SECRET
  ) {
    return {
      error:
        "Google login is not configured yet. Please use email and password.",
    };
  }
  await clearGoogleHandoff();
  const mode = form.get("mode") === "link" ? "link" : "login";
  const returnTo = localReturnPath(
    String(form.get("returnTo") || "/dashboard"),
  );
  (await cookies()).set(
    "bloghub_oauth_intent",
    JSON.stringify({ mode, returnTo }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    },
  );
  // Auth.js redirects here, outside a catch so Next's redirect is preserved.
  await signIn("google", { redirectTo: "/auth/google" });
  return { error: "" };
}

export async function prepareGoogleAction() {
  const idToken = await readGoogleHandoff();
  const result = unwrapApiResult(
    await apiWrapper<{
      step: "login" | "link" | "register";
      email: string;
      displayName: string;
    }>({
      endpoint: `${API_BASE}/auth/google/prepare`,
      method: "POST",
      body: { idToken },
      headers: {
        Origin: process.env.AUTH_URL
          ? new URL(process.env.AUTH_URL).origin
          : "http://localhost:3000",
      },
    }),
  );
  let mode = "login",
    returnTo = "/dashboard";
  try {
    const intent = JSON.parse(
      (await cookies()).get("bloghub_oauth_intent")?.value || "{}",
    );
    mode = intent.mode === "link" ? "link" : "login";
    returnTo = localReturnPath(intent.returnTo);
  } catch {
    /* An absent intent uses the regular login flow. */
  }
  return { ...result, mode, returnTo };
}

export async function completeGoogleAction(
  form: FormData,
  accessToken?: string,
) {
  try {
    const pending = await prepareGoogleAction();
    const idToken = await readGoogleHandoff();
    const password = String(form.get("password") || "");
    if (pending.mode === "link") {
      if (!accessToken)
        throw new ApiError("Sign in before linking Google.", 401);
      unwrapApiResult(
        await apiWrapper({
          endpoint: `${API_BASE}/auth/google/link`,
          method: "POST",
          body: { idToken, currentPassword: password },
          headers: { Authorization: `Bearer ${accessToken}` },
          requiredAuth: true,
        }),
      );
      await clearGoogleHandoff();
      return {
        data: null,
        linked: true,
        returnTo: "/settings",
        error: "",
        status: 200,
      };
    }
    if (
      pending.step === "register" &&
      password !== form.get("confirmPassword")
    ) {
      throw new ApiError("Passwords do not match.", 400);
    }
    const data = await finishGoogleSession(idToken, password);
    await clearGoogleHandoff();
    return {
      data,
      linked: false,
      returnTo: pending.returnTo,
      error: "",
      status: 200,
    };
  } catch (failure) {
    return {
      data: null,
      linked: false,
      returnTo: "",
      error: errorMessage(failure),
      status: failure instanceof ApiError ? failure.status : 500,
    };
  }
}

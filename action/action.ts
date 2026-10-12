"use server";
import type { TokenResponse } from "@/type/type";

import { cookies, headers } from "next/headers";
import { ApiError, errorMessage, registerUser, requestAuthSession } from "@/lib/api";

const refreshCookie = "bloghub_refresh";

// Server fetch does not transfer the backend's cookies to the browser automatically.
async function authRequest(
  path: "login" | "refresh" | "logout",
  body?: object,
) {
  const cookieStore = await cookies();
  const incomingHeaders = await headers();
  const requestHeaders = new Headers();
  const origin = incomingHeaders.get("origin");
  if (origin) requestHeaders.set("Origin", origin);
  const refreshToken = cookieStore.get(refreshCookie)?.value;
  if (refreshToken)
    requestHeaders.set("Cookie", `${refreshCookie}=${refreshToken}`);
  if (body) requestHeaders.set("Content-Type", "application/json");

  let backendCookie: string | undefined;
  const data = await requestAuthSession(path, requestHeaders, body, (response) => {
    if (
      (response.status === 401 && path === "refresh") ||
      (response.ok && path === "logout")
    ) {
      cookieStore.delete(refreshCookie);
    }
    if (response.ok && path !== "logout") {
      backendCookie = response.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith(`${refreshCookie}=`));
    }
  });
  if (path === "logout") return null;
  const value = backendCookie?.split(";")[0].slice(refreshCookie.length + 1);
  if (
    !value ||
    typeof data?.accessToken !== "string" ||
    typeof data?.expiresIn !== "number"
  ) {
    throw new ApiError(
      "The server returned an unreadable session. Please try again.",
      502,
    );
  }
  const expires = /;\s*Expires=([^;]+)/i.exec(backendCookie!)?.[1];
  const maxAge = /;\s*Max-Age=(\d+)/i.exec(backendCookie!)?.[1];
  cookieStore.set(refreshCookie, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(expires ? { expires: new Date(expires) } : {}),
    ...(maxAge ? { maxAge: Number(maxAge) } : {}),
  });
  return data as TokenResponse;
}

export async function submitAuthAction(
  mode: "login" | "register",
  form: FormData,
) {
  try {
    if (mode !== "login" && mode !== "register")
      throw new ApiError("Invalid form.", 400);
    const email = String(form.get("email") || "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") || "");
    const displayName = String(form.get("displayName") || "").trim();
    if (!email || email.length > 254 || !password)
      throw new ApiError("Email and password are required.", 400);
    if (new TextEncoder().encode(password).length > 72) {
      throw new ApiError(
        "Password must be no more than 72 UTF-8 bytes. Use fewer characters.",
        400,
      );
    }
    if (mode === "register") {
      if (!displayName || displayName.length > 100 || password.length < 8) {
        throw new ApiError(
          "Enter a display name and a password of at least 8 characters.",
          400,
        );
      }
      await registerUser({ displayName, email, password });
      return { data: null, error: "", status: 200 };
    }
    return {
      data: await authRequest("login", { email, password }),
      error: "",
      status: 200,
    };
  } catch (failure) {
    return {
      data: null,
      error: errorMessage(failure),
      status: failure instanceof ApiError ? failure.status : 500,
    };
  }
}

export async function refreshSessionAction() {
  try {
    return { data: await authRequest("refresh"), error: "", status: 200 };
  } catch (failure) {
    return {
      data: null,
      error: errorMessage(failure),
      status: failure instanceof ApiError ? failure.status : 500,
    };
  }
}

export async function logoutAction() {
  try {
    await authRequest("logout");
    return { error: "", status: 200 };
  } catch (failure) {
    return {
      error: errorMessage(failure),
      status: failure instanceof ApiError ? failure.status : 500,
    };
  }
}

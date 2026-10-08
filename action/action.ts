"use server";

import { cookies, headers } from "next/headers";
import {
  API_BASE,
  ApiError,
  errorMessage,
  request,
  TokenResponse,
} from "@/lib/api";

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

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/auth/${path}`, {
      method: "POST",
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(
      "Unable to reach BlogHub. Check your connection and try again.",
      0,
    );
  }

  if (
    (response.status === 401 && path === "refresh") ||
    (response.ok && path === "logout")
  ) {
    cookieStore.delete(refreshCookie);
  }
  const data =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(" · ")
      : data?.message;
    throw new ApiError(
      typeof message === "string"
        ? message
        : "Unable to complete this request.",
      response.status,
    );
  }
  if (path === "logout") return null;
  const backendCookie = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${refreshCookie}=`));
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
      await request("/auth/register", {
        method: "POST",
        body: JSON.stringify({ displayName, email, password }),
      });
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

import type { TokenResponse } from "@/type/type";
import { ApiError, apiRequest } from "./api";
import { refreshSessionAction } from "@/action/action";
import { mutateContentAction } from "@/action/content";
let accessToken = "";
let expiresAt = 0;
let refreshPromise: Promise<string> | null = null;
let generation = 0;
export async function sessionLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request("bloghub-session", operation);
  return operation();
}
export function clearSession() {
  generation++;
  accessToken = "";
  expiresAt = 0;
}
export function setSession(data: TokenResponse) {
  accessToken = data.accessToken;
  expiresAt = Date.now() + data.expiresIn * 1000;
}
export function refreshSession() {
  if (refreshPromise) return refreshPromise;
  const currentGeneration = generation;
  refreshPromise = sessionLock(async () => {
    const result = await refreshSessionAction();
    if (!result.data) throw new ApiError(result.error, result.status);
    const data = result.data;
    if (generation !== currentGeneration)
      throw new ApiError("Your session changed. Please sign in again.", 401);
    setSession(data);
    return data.accessToken;
  }).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}
export async function authenticatedRequest<T>(
  path: string,
  method = "GET",
  options: RequestInit = {},
  retryUnauthorized = true,
) {
  const token =
    accessToken && Date.now() < expiresAt - 10000
      ? accessToken
      : await refreshSession();
  const send = async (value: string): Promise<T> => {
    if (
      ["POST", "PATCH", "DELETE"].includes(method) &&
      /^\/(blogs|categories|tags)(\/|$)|^\/admin\/blogs\//.test(path)
    ) {
      if (
        options.body != null && typeof options.body !== "string" &&
        !(options.body instanceof FormData)
      )
        throw new ApiError("Unsupported content body.", 400);
      const result = await mutateContentAction(
        path, method, options.body ?? undefined, value,
      );
      if (!result.ok) throw new ApiError(result.error, result.status);
      return result.data as T;
    }
    return apiRequest<T>(path, method, {
      ...options,
      headers: {
        ...Object.fromEntries(new Headers(options.headers)),
        Authorization: `Bearer ${value}`,
      },
    });
  };
  try {
    return await send(token);
  } catch (error) {
    if (
      !retryUnauthorized ||
      !(error instanceof ApiError) ||
      error.status !== 401
    )
      throw error;
    return send(
      accessToken && accessToken !== token
        ? accessToken
        : await refreshSession(),
    );
  }
}

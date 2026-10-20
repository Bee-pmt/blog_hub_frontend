export type ApiRequest = <T>(
  route: string,
  method?: string,
  options?: RequestInit,
) => Promise<T>;

export type ApiWrapperOptions = Omit<
  RequestInit,
  "body" | "method" | "headers"
> & {
  endpoint: string;
  method?: string;
  body?: object | string | null;
  headers?: HeadersInit;
  requiredAuth?: boolean;
  onResponse?: (response: Response) => void;
  allowEmpty?: boolean;
};

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; data: { error: string } };

export const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5300/api/v1"
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiWrapper<T>({
  endpoint,
  method = "GET",
  body,
  headers: incomingHeaders,
  requiredAuth = false,
  onResponse,
  allowEmpty = false,
  ...options
}: ApiWrapperOptions): Promise<ApiResult<T>> {
  const headers = new Headers(incomingHeaders);
  if (requiredAuth && !/^Bearer \S+$/i.test(headers.get("Authorization") || ""))
    return {
      ok: false,
      status: 401,
      data: { error: "Access token is required" },
    };

  // Objects become JSON; FormData supplies its own multipart Content-Type.
  const requestBody =
    body == null || typeof body === "string" || body instanceof FormData
      ? body
      : JSON.stringify(body);
  if (requestBody != null && !(requestBody instanceof FormData))
    headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(endpoint, {
      ...options,
      method,
      body: requestBody,
      headers,
      cache: "no-store",
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      data: {
        error: options.signal?.aborted
          ? "The request was cancelled."
          : "Unable to reach BlogHub. Check your connection and try again.",
      },
    };
  }

  // Auth actions must copy/clear refresh cookies even on an HTTP failure.
  onResponse?.(response);
  if (response.status === 204)
    return { ok: true, status: response.status, data: undefined as T };
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(" · ")
      : (data?.message ?? data?.error);
    return {
      ok: false,
      status: response.status,
      data: {
        error:
          typeof message === "string"
            ? message
            : `Request failed (${response.status}). Please try again.`,
      },
    };
  }
  if (data === null && !allowEmpty)
    return {
      ok: false,
      status: response.status,
      data: { error: "The server returned an unreadable response." },
    };
  return { ok: true, status: response.status, data: data as T };
}

// Higher-level callers still use thrown ApiErrors for refresh/retry and page errors.
export function unwrapApiResult<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new ApiError(result.data.error, result.status);
  return result.data;
}

export function errorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return "Something went wrong. Please try again.";
}

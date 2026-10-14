export type ApiRequest = <T>(
  route: string,
  method?: string,
  options?: RequestInit,
) => Promise<T>;

export type ApiResponseOptions = {
  onResponse?: (response: Response) => void;
  allowEmpty?: boolean;
};

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

export async function apiRequest<T>(
  route: string,
  method = "GET",
  options: RequestInit = {},
  responseOptions: ApiResponseOptions = {},
): Promise<T> {
  // Set JSON headers for text bodies; file uploads supply their own headers.
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${route}`, {
      ...options,
      method,
      headers,
      cache: "no-store",
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      "Unable to reach BlogHub. Check your connection and try again.",
      0,
    );
  }
  // Authentication actions use this callback to copy the refresh cookie.
  responseOptions.onResponse?.(response);
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(" · ")
      : data?.message;
    throw new ApiError(
      typeof message === "string"
        ? message
        : `Request failed (${response.status}). Please try again.`,
      response.status,
    );
  }
  if (data === null && !responseOptions.allowEmpty)
    throw new ApiError(
      "The server returned an unreadable response.",
      response.status,
    );
  return data as T;
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

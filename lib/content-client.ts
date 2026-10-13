"use client";
import { mutateContentAction } from "@/actions/content";
import { ApiError } from "./api";
import { withAccessToken } from "./session";

// Content writes explicitly use a Server Action so Next.js cache tags are expired.
export async function contentRequest<T>(
  route: string,
  method = "POST",
  options: RequestInit = {},
) {
  if (
    options.body != null &&
    typeof options.body !== "string" &&
    !(options.body instanceof FormData)
  )
    throw new ApiError("Unsupported content body.", 400);
  const body = options.body ?? undefined;
  return withAccessToken(async (token) => {
    const result = await mutateContentAction(route, method, body, token);
    if (!result.ok) throw new ApiError(result.error, result.status);
    return result.data as T;
  });
}

"use server";
import { updateTag } from "next/cache";
import { ApiError, apiRequest, errorMessage } from "@/lib/api-client";

export async function mutateContentAction(
  path: string,
  method: string,
  body: string | FormData | undefined,
  accessToken: string,
) {
  // The backend still verifies the token, role, ownership, and input for every write.
  const collection = /^\/(blogs|categories|tags)$/.test(path);
  const item = /^\/(blogs|categories|tags)\/[a-zA-Z0-9-]+$/.test(path);
  const moderation = /^\/admin\/blogs\/[a-zA-Z0-9-]+\/status$/.test(path);
  if (!(
    (collection && method === "POST") ||
    (item && ["PATCH", "DELETE"].includes(method)) ||
    (moderation && method === "PATCH")
  ))
    return {
      ok: false as const,
      error: "Unsupported content operation.",
      status: 400,
    };
  if (!accessToken)
    return { ok: false as const, error: "Please sign in again.", status: 401 };
  try {
    const data = await apiRequest<unknown>(path, method, {
      body,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    updateTag("blogs");
    if (/^\/(categories|tags)(\/|$)/.test(path)) updateTag("taxonomy");
    return { ok: true as const, data };
  } catch (error) {
    return {
      ok: false as const,
      error: errorMessage(error),
      status: error instanceof ApiError ? error.status : 0,
    };
  }
}

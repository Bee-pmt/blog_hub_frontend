"use server";
import { updateTag } from "next/cache";
import { API_BASE, ApiError, apiWrapper, errorMessage } from "@/lib/api-client";

export async function mutateContentAction(
  path: string,
  method: string,
  body: string | FormData | undefined,
  accessToken: string,
) {
  // The backend still verifies the token, role, ownership, and input for every write.
  const collection = /^\/(blogs|categories|tags)$/.test(path);
  const item = /^\/(blogs|categories|tags)\/[a-zA-Z0-9-]+$/.test(path);
  const versionedDelete = /^\/blogs\/[a-zA-Z0-9-]+\?version=\d+$/.test(path) && method === "DELETE";
  const moderation = /^\/admin\/blogs\/[a-zA-Z0-9-]+\/status$/.test(path);
  const trash = /^\/(me|admin)\/blog-trash\/[a-zA-Z0-9-]+(\/restore)?$/.test(path);
  if (!(
    (collection && method === "POST") ||
    (item && ["PATCH", "DELETE"].includes(method)) ||
    (moderation && method === "PATCH") || versionedDelete ||
    (trash && ((path.endsWith("/restore") && method === "POST") || (!path.endsWith("/restore") && method === "DELETE")))
  ))
    return {
      ok: false as const,
      error: "Unsupported content operation.",
      status: 400,
    };
  if (!accessToken)
    return { ok: false as const, error: "Please sign in again.", status: 401 };
  try {
    const result = await apiWrapper<unknown>({
      endpoint: `${API_BASE}${path}`,
      method,
      body,
      headers: { Authorization: `Bearer ${accessToken}` },
      requiredAuth: true,
    });
    if (!result.ok) {
      if ([404, 409].includes(result.status)) updateTag("blogs");
      return {
        ok: false as const,
        error: result.data.error,
        status: result.status,
      };
    }
    updateTag("blogs");
    if (/^\/(categories|tags)(\/|$)/.test(path)) updateTag("taxonomy");
    return { ok: true as const, data: result.data };
  } catch (error) {
    return {
      ok: false as const,
      error: errorMessage(error),
      status: error instanceof ApiError ? error.status : 0,
    };
  }
}

import type { ApiRequest } from "@/lib/api-client";
import { API_BASE, apiWrapper, unwrapApiResult } from "@/lib/api-client";
import type { User } from "@/modules/users/types";
import type { TokenResponse, RegistrationInput } from "./types";

export function getCurrentUser(send: ApiRequest) {
  return send<User>("/auth/me");
}

export async function registerUser(input: RegistrationInput) {
  return unwrapApiResult(
    await apiWrapper<{ message: string }>({
      endpoint: `${API_BASE}/auth/register`,
      method: "POST",
      body: input,
    }),
  );
}

// The Server Action copies cookies using onResponse, including failed refreshes.
export async function requestAuthSession(
  route: "login" | "refresh" | "logout" | "google",
  headers: Headers,
  body: object | undefined,
  onResponse: (response: Response) => void,
) {
  return unwrapApiResult(
    await apiWrapper<TokenResponse | null>({
      endpoint: `${API_BASE}/auth/${route}`,
      method: "POST",
      headers,
      body,
      onResponse,
      allowEmpty: true,
    }),
  );
}

export function localReturnPath(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return "/dashboard";
  const url = new URL(value, "https://bloghub.local");
  if (
    url.origin !== "https://bloghub.local" ||
    ["/login", "/register"].includes(url.pathname)
  )
    return "/dashboard";
  return url.pathname + url.search + url.hash;
}

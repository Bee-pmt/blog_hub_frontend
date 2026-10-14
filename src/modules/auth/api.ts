import type { ApiRequest } from "@/lib/api-client";
import { apiRequest } from "@/lib/api-client";
import type { User } from "@/modules/users/types";
import type { TokenResponse, RegistrationInput } from "./types";

export function getCurrentUser(send: ApiRequest) {
  return send<User>("/auth/me");
}

export function registerUser(input: RegistrationInput) {
  return apiRequest<User>("/auth/register", "POST", {
    body: JSON.stringify(input),
  });
}

// The Server Action copies cookies using onResponse, including failed refreshes.
export function requestAuthSession(
  route: "login" | "refresh" | "logout",
  headers: Headers,
  body: object | undefined,
  onResponse: (response: Response) => void,
) {
  return apiRequest<TokenResponse | null>(
    `/auth/${route}`,
    "POST",
    { headers, body: body ? JSON.stringify(body) : undefined },
    { onResponse, allowEmpty: true },
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

import type {
  User,
  ManagedUser,
  UserPage,
  Category,
  Tag,
  Blog,
  BlogPage,
  BlogInput,
  TokenResponse,
  ApiRequest,
  ApiResponseOptions,
  ManagedBlogFilters,
  TaxonomyInput,
  RegistrationInput,
  TaxonomyKind,
} from "@/types/models";
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

// Public reads use apiRequest; protected calls receive AuthProvider's api function.
export function getBlogs(
  filters: Record<string, string | number | undefined> = {},
) {
  return apiRequest<BlogPage>(`/blogs${queryString(filters)}`);
}

export function getBlog(slug: string) {
  return apiRequest<Blog>(`/blogs/${encodeURIComponent(slug)}`);
}

export function getCategories(send: ApiRequest = apiRequest) {
  return send<Category[]>("/categories");
}

export function getTags(send: ApiRequest = apiRequest) {
  return send<Tag[]>("/tags");
}

export function getCurrentUser(send: ApiRequest) {
  return send<User>("/auth/me");
}

export function getManagedBlogs(
  admin: boolean,
  filters: ManagedBlogFilters,
  send: ApiRequest,
) {
  return send<BlogPage>(
    `${admin ? "/admin" : "/me"}/blogs${queryString(filters)}`,
  );
}

export function getEditableBlog(id: string, admin: boolean, send: ApiRequest) {
  return send<Blog>(
    `${admin ? "/admin" : "/me"}/blogs/${encodeURIComponent(id)}`,
  );
}

export function saveBlog(
  input: BlogInput,
  id: string | undefined,
  image: File | null,
  send: ApiRequest,
) {
  let body: string | FormData = JSON.stringify(input);
  if (image) {
    const form = new FormData();
    form.set("title", input.title);
    form.set("content", input.content);
    if (input.categoryId) form.set("categoryId", input.categoryId);
    form.set("tagIds", JSON.stringify(input.tagIds));
    form.set("status", input.status);
    form.set("image", image);
    body = form;
  }
  return send<Blog>(
    id ? `/blogs/${encodeURIComponent(id)}` : "/blogs",
    id ? "PATCH" : "POST",
    { body },
  );
}

export function setBlogStatus(
  id: string,
  status: Blog["status"],
  send: ApiRequest,
  admin = false,
) {
  return send<Blog>(
    admin
      ? `/admin/blogs/${encodeURIComponent(id)}/status`
      : `/blogs/${encodeURIComponent(id)}`,
    "PATCH",
    { body: JSON.stringify({ status }) },
  );
}

export function deleteBlog(id: string, send: ApiRequest) {
  return send<void>(`/blogs/${encodeURIComponent(id)}`, "DELETE");
}

export function saveTaxonomy(
  kind: TaxonomyKind,
  input: TaxonomyInput,
  send: ApiRequest,
  id?: string,
) {
  return send<Category | Tag>(
    `/${kind}${id ? `/${encodeURIComponent(id)}` : ""}`,
    id ? "PATCH" : "POST",
    { body: JSON.stringify(input) },
  );
}

export function deleteTaxonomy(
  kind: TaxonomyKind,
  id: string,
  send: ApiRequest,
) {
  return send<void>(`/${kind}/${encodeURIComponent(id)}`, "DELETE");
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

export function queryString(
  values: Record<string, string | number | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && String(value).trim())
      query.set(key, String(value).trim());
  const result = query.toString();
  return result ? `?${result}` : "";
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

export function httpUrl(value: string) {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
export function blogImageUrl(value: string) {
  if (httpUrl(value)) return value;
  if (/^\/images\/[0-9a-f-]{36}\.(png|jpg|webp)$/i.test(value))
    return new URL(value, new URL(API_BASE).origin).href;
  return "";
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export function getManagedUsers(q: string, page: number, send: ApiRequest) {
  return send<UserPage>(`/admin/users${queryString({ q, page, limit: 10 })}`);
}

export function updateManagedUser(
  id: string,
  change: { role: User["role"] } | { status: ManagedUser["status"] },
  send: ApiRequest,
) {
  return send<ManagedUser>(
    `/admin/users/${encodeURIComponent(id)}/${"role" in change ? "role" : "status"}`,
    "PATCH",
    { body: JSON.stringify(change) },
  );
}

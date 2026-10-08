export type User = {
  id: string;
  displayName: string;
  email: string;
  role: "author" | "admin";
  createdAt: string;
  updatedAt: string;
};
export type Category = {
  id: string;
  name: string;
  slug: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};
export type Tag = Category & { categoryId: string };
export type BlogSummary = {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  author: { id: string; displayName: string };
  categoryId: string | null;
  category: Pick<Category, "id" | "name" | "slug"> | null;
  categoryName: string;
  tags: Pick<Tag, "id" | "name" | "slug" | "categoryId">[];
  coverImageUrl: string | null;
  status: "draft" | "published";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Blog = BlogSummary & { content: string };
export type BlogPage = {
  items: (BlogSummary & { excerpt: string })[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
export type BlogInput = {
  title: string;
  content: string;
  categoryId?: string;
  tagIds: string[];
  coverImageUrl?: string | null;
  status: Blog["status"];
};
export type TokenResponse = { accessToken: string; expiresIn: number };
export type Filters = {
  q?: string;
  category?: string;
  tag?: string;
  author?: string;
  page?: string;
  status?: string;
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

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
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
  if (data === null)
    throw new ApiError(
      "The server returned an unreadable response.",
      response.status,
    );
  return data as T;
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

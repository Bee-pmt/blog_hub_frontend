import {
  API_BASE,
  apiWrapper,
  unwrapApiResult,
  type ApiRequest,
} from "@/lib/api-client";
import { queryString, httpUrl } from "@/lib/utils";
import type { Blog, BlogPage, BlogInput } from "./types";

// Public reads use apiWrapper; saving receives the authenticated content sender.
export async function getBlogs(
  filters: Record<string, string | number | undefined> = {},
) {
  return unwrapApiResult(
    await apiWrapper<BlogPage>({
      endpoint: `${API_BASE}/blogs${queryString(filters)}`,
    }),
  );
}

export async function getBlog(slug: string) {
  return unwrapApiResult(
    await apiWrapper<Blog>({
      endpoint: `${API_BASE}/blogs/${encodeURIComponent(slug)}`,
    }),
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

export function blogImageUrl(value: string) {
  if (httpUrl(value)) return value;
  if (/^\/images\/[0-9a-f-]{36}\.(png|jpg|webp)$/i.test(value))
    return new URL(value, new URL(API_BASE).origin).href;
  return "";
}

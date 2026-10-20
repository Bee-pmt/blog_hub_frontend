import { API_BASE, apiWrapper, unwrapApiResult } from "@/lib/api-client";
import type { Category, Tag } from "./types";

export async function getCategories() {
  return unwrapApiResult(
    await apiWrapper<Category[]>({ endpoint: `${API_BASE}/categories` }),
  );
}
export async function getTags() {
  return unwrapApiResult(
    await apiWrapper<Tag[]>({ endpoint: `${API_BASE}/tags` }),
  );
}

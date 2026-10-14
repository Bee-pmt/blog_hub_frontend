import { apiRequest, type ApiRequest } from "@/lib/api-client";
import type { Category, Tag } from "./types";

export function getCategories(send: ApiRequest = apiRequest) {
  return send<Category[]>("/categories");
}

export function getTags(send: ApiRequest = apiRequest) {
  return send<Tag[]>("/tags");
}

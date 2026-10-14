import { cacheLife, cacheTag } from "next/cache";
import { getBlogs, getBlog } from "./api";

// Only public data belongs here. Never pass an access token into these functions.
export async function getCachedBlogs(
  filters: Record<string, string | number | undefined> = {},
) {
  "use cache";
  cacheTag("blogs");
  cacheLife({ stale: 0, revalidate: 60, expire: 120 });
  return getBlogs(filters);
}

export async function getCachedBlog(slug: string) {
  "use cache";
  cacheTag("blogs");
  cacheLife({ stale: 0, revalidate: 60, expire: 120 });
  return getBlog(slug);
}

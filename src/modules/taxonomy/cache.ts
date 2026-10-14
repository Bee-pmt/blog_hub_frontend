import { cacheLife, cacheTag } from "next/cache";
import { getCategories, getTags } from "./api";

export async function getCachedTaxonomy() {
  "use cache";
  cacheTag("taxonomy");
  cacheLife({ stale: 0, revalidate: 60, expire: 120 });
  const [categories, tags] = await Promise.all([getCategories(), getTags()]);
  return { categories, tags };
}

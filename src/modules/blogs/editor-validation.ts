import type { BlogInput } from "@/modules/blogs/types";
import { blogImageUrl } from "@/modules/blogs/api";

// These constructs are readable in Preview but intentionally kept in source mode.
export function needsSourceMode(markdown: string) {
  const withoutCode = markdown
    .replace(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?\1/g, "")
    .replace(/`[^`]*`/g, "");
  return /<\/?[a-z][^>]*>|^\s*\|.*\||^.*\n\s*\|?\s*:?-{3,}\s*\||^\s*[-*+]\s+\[[ xX]\]|^\s*\[[^\]]+\]:|\[\^[^\]]+\]|~~|^\s*\$\$/im.test(
    withoutCode,
  );
}
export function validatePost(input: BlogInput, isNew: boolean) {
  if (!input.title.trim() || input.title.trim().length > 200)
    return "Add a title of up to 200 characters.";
  if (!input.content.trim() || input.content.length > 100000)
    return "Add story content of up to 100,000 characters.";
  if (isNew && !input.categoryId) return "Choose a category before saving.";
  if (input.tagIds.length > 10) return "Select no more than 10 tags.";
  if (
    input.coverImageUrl &&
    (!blogImageUrl(input.coverImageUrl) || input.coverImageUrl.length > 2048)
  )
    return "Use a valid HTTP or HTTPS cover URL of up to 2,048 characters.";
  return "";
}

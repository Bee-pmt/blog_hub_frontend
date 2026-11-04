import type { Category, Tag } from "@/modules/taxonomy/types";

export type BlogSummary = {
  version?: number;
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
  publicationBlocked?: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Blog = BlogSummary & { content: string };

export type BlogComment = {
  id: string;
  blogId: string;
  parentId: string | null;
  replyCount: number;
  likeCount: number;
  dislikeCount: number;
  author: { id: string; displayName: string };
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type CommentPage = {
  items: BlogComment[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ReactionType = "like" | "dislike";
export type ReactionSummary = {
  likeCount: number;
  dislikeCount: number;
  myReaction: ReactionType | null;
};

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

export type Filters = {
  q?: string;
  category?: string;
  tag?: string;
  author?: string;
  page?: string;
  status?: string;
};

export type Draft = {
  title: string;
  content: string;
  categoryId: string;
  tagIds: string[];
  coverImageUrl: string;
};

export type Recovery = {
  draft: Draft;
  savedAt: string;
  baseUpdatedAt: string | null;
};

export type BlogAuditSummary = {
  id: string;
  blogId: string;
  blogTitle: string;
  actorId: string;
  postAuthorId: string;
  action: string;
  createdAt: string;
};

type AuditValue = string | boolean | null | Blog["category"] | Blog["tags"];

export type BlogAuditLog = BlogAuditSummary & {
  changes: Record<string, { old: AuditValue; new: AuditValue }>;
  snapshot: (Omit<Blog, "author"> & { authorId: string }) | null;
};

export type BlogAuditPage = {
  items: BlogAuditSummary[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type TrashedBlogSummary = BlogSummary & {
  excerpt: string;
  deletedAt: string;
  deletedById: string | null;
  canRestore: boolean;
  canPermanentlyDelete: boolean;
};
export type TrashedBlog = Omit<TrashedBlogSummary, "excerpt"> & { content: string };
export type BlogTrashPage = Omit<BlogPage, "items"> & { items: TrashedBlogSummary[] };

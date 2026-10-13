import type { StoreApi } from "zustand/vanilla";

export type User = {
  id: string;
  displayName: string;
  email: string;
  role: "author" | "admin";
  createdAt: string;
  updatedAt: string;
};
export type ManagedUser = User & { status: "active" | "disabled" };
export type UserPage = {
  items: ManagedUser[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
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
  publicationBlocked?: boolean;
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

export type ApiRequest = <T>(
  route: string,
  method?: string,
  options?: RequestInit,
) => Promise<T>;

export type Auth = {
  user: User | null;
  loading: boolean;
  error: string;
  restore: () => Promise<void>;
  login: (form: FormData) => Promise<void>;
  logout: () => Promise<void>;
  endSession: () => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  api: ApiRequest;
  contentApi: ApiRequest;
  initialize: () => () => void;
};

export type AuthStore = StoreApi<Auth>;

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

export type ApiResponseOptions = {
  onResponse?: (response: Response) => void;
  allowEmpty?: boolean;
};

export type ManagedBlogFilters = {
  status?: string;
  page?: number;
  limit?: number;
};
export type TaxonomyInput = { name: string; categoryId?: string };
export type RegistrationInput = {
  displayName: string;
  email: string;
  password: string;
};
export type TaxonomyKind = "categories" | "tags";
export type TaxonomySelection = { item: Category; kind: TaxonomyKind };

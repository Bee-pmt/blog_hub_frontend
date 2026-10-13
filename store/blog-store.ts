import { createStore } from "zustand/vanilla";
import type {
  ApiRequest,
  Blog,
  BlogInput,
  BlogPage,
  BlogSummary,
  TaxonomyKind,
} from "@/type/type";
import {
  deleteBlog,
  errorMessage,
  getEditableBlog,
  getManagedBlogs,
  saveBlog,
  setBlogStatus,
} from "@/lib/api";

type Cached<T> = { data: T; fetchedAt: number };
type ListEntry = {
  data: BlogPage | null;
  loading: boolean;
  error: string;
  fetchedAt: number;
};
export type BlogState = {
  lists: Record<string, ListEntry>;
  details: Record<string, Cached<Blog>>;
  version: number;
  loadBlogs: (
    admin: boolean,
    status: string,
    page: number,
    api: ApiRequest,
    force?: boolean,
  ) => Promise<BlogPage>;
  loadBlog: (
    id: string,
    admin: boolean,
    api: ApiRequest,
    force?: boolean,
  ) => Promise<Blog>;
  save: (
    input: BlogInput,
    id: string | undefined,
    image: File | null,
    api: ApiRequest,
  ) => Promise<Blog>;
  changeStatus: (
    id: string,
    status: Blog["status"],
    admin: boolean,
    api: ApiRequest,
  ) => Promise<void>;
  remove: (id: string, api: ApiRequest) => Promise<void>;
  invalidateTaxonomy: (kind: TaxonomyKind, id: string) => void;
  reset: () => void;
};

export function blogListKey(admin: boolean, status: string, page: number) {
  return `${admin ? "admin" : "mine"}:${status}:${page}`;
}

export function createBlogStore(
  getUserId: () => string | undefined = () => undefined,
) {
  const listRequests = new Map<string, Promise<BlogPage>>();
  const detailRequests = new Map<string, Promise<Blog>>();
  let session = 0;

  return createStore<BlogState>()((set, get) => {
    function findBlog(id: string) {
      return (
        Object.values(get().details).find((entry) => entry.data.id === id)
          ?.data ??
        Object.values(get().lists)
          .flatMap((entry) => entry.data?.items ?? [])
          .find((blog) => blog.id === id)
      );
    }
    function invalidateLists(
      matches: (key: string, entry: ListEntry) => boolean,
    ) {
      const lists = { ...get().lists };
      for (const [key, entry] of Object.entries(lists)) {
        if (matches(key, entry)) {
          delete lists[key];
          listRequests.delete(key); // A late response must not restore an invalidated list.
        }
      }
      set((state) => ({ lists, version: state.version + 1 }));
    }
    function invalidateBlog(
      id: string,
      blog?: BlogSummary,
      previousStatus?: Blog["status"] | null,
    ) {
      const details = { ...get().details };
      for (const key of new Set([
        ...Object.keys(details),
        ...detailRequests.keys(),
      ])) {
        if (key.split(":")[1] === id) {
          delete details[key];
          detailRequests.delete(key);
        }
      }
      set({ details });
      invalidateLists((key) => {
        const [view, status] = key.split(":");
        if (
          view === "mine" &&
          blog &&
          getUserId() &&
          blog.author.id !== getUserId()
        )
          return false;
        // All pages of affected filters may shift when membership/order changes.
        return (
          !status ||
          !blog ||
          previousStatus === undefined ||
          status === previousStatus ||
          status === blog.status
        );
      });
    }
    return {
      lists: {},
      details: {},
      version: 0,
      async loadBlogs(admin, status, page, api, force = false) {
        const key = blogListKey(admin, status, page);
        const entry = get().lists[key];
        if (!force && entry?.data && Date.now() - entry.fetchedAt < 60000)
          return entry.data;
        const pending = listRequests.get(key);
        if (pending) return pending;
        set((state) => ({
          lists: {
            ...state.lists,
            [key]: {
              data: entry?.data ?? null,
              loading: true,
              error: "",
              fetchedAt: 0,
            },
          },
        }));
        const request = getManagedBlogs(admin, { status, page, limit: 10 }, api)
          .then((data) => {
            if (listRequests.get(key) !== request)
              throw new Error("Content changed. Please try again.");
            set((state) => ({
              lists: {
                ...state.lists,
                [key]: {
                  data,
                  loading: false,
                  error: "",
                  fetchedAt: Date.now(),
                },
              },
            }));
            return data;
          })
          .catch((error) => {
            if (listRequests.get(key) === request)
              set((state) => ({
                lists: {
                  ...state.lists,
                  [key]: {
                    data: entry?.data ?? null,
                    loading: false,
                    error: errorMessage(error),
                    fetchedAt: 0,
                  },
                },
              }));
            throw error;
          })
          .finally(() => {
            if (listRequests.get(key) === request) listRequests.delete(key);
          });
        listRequests.set(key, request);
        return request;
      },
      async loadBlog(id, admin, api, force = false) {
        const key = `${admin ? "admin" : "mine"}:${id}`;
        const cached = get().details[key];
        if (!force && cached && Date.now() - cached.fetchedAt < 60000)
          return cached.data;
        const pending = detailRequests.get(key);
        if (pending) return pending;
        // The editor owns detail loading/errors. The store only caches successful results.
        const request = getEditableBlog(id, admin, api)
          .then((data) => {
            if (detailRequests.get(key) !== request)
              throw new Error("Content changed. Please try again.");
            set((state) => ({
              details: {
                ...state.details,
                [key]: { data, fetchedAt: Date.now() },
              },
            }));
            return data;
          })
          .finally(() => {
            if (detailRequests.get(key) === request) detailRequests.delete(key);
          });
        detailRequests.set(key, request);
        return request;
      },
      async save(input, id, image, api) {
        const currentSession = session;
        const previous = id ? findBlog(id)?.status : null;
        const blog = await saveBlog(input, id, image, api);
        if (session === currentSession) {
          invalidateBlog(blog.id, blog, previous);
          set((state) => ({
            details: {
              ...state.details,
              [`mine:${blog.id}`]: { data: blog, fetchedAt: Date.now() },
            },
          }));
        }
        return blog;
      },
      async changeStatus(id, status, admin, api) {
        const currentSession = session;
        const previous = findBlog(id)?.status;
        const blog = await setBlogStatus(id, status, api, admin);
        if (session === currentSession) invalidateBlog(id, blog, previous);
      },
      async remove(id, api) {
        const currentSession = session;
        const blog = findBlog(id);
        await deleteBlog(id, api);
        if (session === currentSession) invalidateBlog(id, blog, blog?.status);
      },
      invalidateTaxonomy(kind, id) {
        const matches = (blog: BlogSummary) =>
          kind === "categories"
            ? blog.categoryId === id
            : blog.tags.some((tag) => tag.id === id);
        const details = { ...get().details };
        for (const [key, entry] of Object.entries(details))
          if (matches(entry.data)) delete details[key];
        // Pending reads may include the changed taxonomy, so discard their results too.
        detailRequests.clear();
        set({ details });
        invalidateLists(
          (_key, entry) => entry.loading || !!entry.data?.items.some(matches),
        );
      },
      reset() {
        session++;
        listRequests.clear();
        detailRequests.clear();
        set((state) => ({
          lists: {},
          details: {},
          version: state.version + 1,
        }));
      },
    };
  });
}

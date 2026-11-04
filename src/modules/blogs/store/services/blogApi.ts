import type { RootState } from "@/lib/store";
import { baseApi } from "@/lib/api/baseApi";
import { queryString } from "@/lib/utils";
import type {
  Blog,
  BlogInput,
  BlogPage,
  BlogAuditLog,
  BlogAuditPage,
  Filters,
  BlogTrashPage,
  TrashedBlog,
} from "../../types";
import { saveBlog } from "../../api";
import { ApiError, errorMessage } from "@/lib/api-client";
import { contentRequest } from "@/lib/content-client";
import { clearSession } from "@/lib/session";
import { refreshProfile, sessionEnded } from "@/modules/auth/store/slices/authSlice";

export const blogApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getFeed: builder.infiniteQuery<BlogPage, Filters, number>({
      infiniteQueryOptions: {
        initialPageParam: 1,
        getNextPageParam: (lastPage) => lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
      },
      query: ({ queryArg, pageParam }) => ({
        route: `/blogs${queryString({ ...queryArg, page: pageParam, limit: 9 })}`,
        public: true,
      }),
      providesTags: ["Blog"],
    }),
    getMyBlogAuditLogs: builder.query<BlogAuditPage, number>({
      query: (page) => ({
        route: `/me/blog-audit-logs${queryString({ page, limit: 10 })}`,
      }),
      providesTags: ["BlogAudit"],
    }),
    getMyBlogAuditLog: builder.query<BlogAuditLog, string>({
      query: (id) => ({
        route: `/me/blog-audit-logs/${encodeURIComponent(id)}`,
      }),
      providesTags: ["BlogAudit"],
    }),
    getBlogTrash: builder.query<BlogTrashPage, { admin: boolean; page: number }>({
      query: ({ admin, page }) => ({ route: `${admin ? "/admin" : "/me"}/blog-trash?page=${page}&limit=10` }),
      providesTags: ["BlogTrash"],
    }),
    getTrashedBlog: builder.query<TrashedBlog, { admin: boolean; id: string }>({
      query: ({ admin, id }) => ({ route: `${admin ? "/admin" : "/me"}/blog-trash/${encodeURIComponent(id)}` }),
      providesTags: ["BlogTrash"],
    }),
    restoreBlog: builder.mutation<Blog, { admin: boolean; id: string }>({
      query: ({ admin, id }) => ({ route: `${admin ? "/admin" : "/me"}/blog-trash/${encodeURIComponent(id)}/restore`, method: "POST" }),
      invalidatesTags: (_result, error) => !error || [404, 409].includes(error.status) ? ["Blog", "BlogAudit", "BlogTrash", "Comment", "Reaction", "Notification"] : [],
    }),
    purgeBlog: builder.mutation<null, { admin: boolean; id: string }>({
      query: ({ admin, id }) => ({ route: `${admin ? "/admin" : "/me"}/blog-trash/${encodeURIComponent(id)}`, method: "DELETE" }),
      invalidatesTags: (_result, error) => !error || [404, 409].includes(error.status) ? ["Blog", "BlogAudit", "BlogTrash", "Comment", "Reaction", "Notification"] : [],
    }),
    getManagedBlogs: builder.query<
      BlogPage,
      { admin: boolean; status: string; page: number }
    >({
      query: ({ admin, status, page }) => ({
        route: `${admin ? "/admin" : "/me"}/blogs${queryString({ status, page, limit: 10 })}`,
      }),
      providesTags: ["Blog"],
    }),
    getEditableBlog: builder.query<Blog, { id: string; admin: boolean }>({
      query: ({ id, admin }) => ({
        route: `${admin ? "/admin" : "/me"}/blogs/${encodeURIComponent(id)}`,
      }),
      providesTags: ["Blog"],
    }),
    saveBlog: builder.mutation<
      Blog,
      { input: BlogInput; id?: string; image: File | null }
    >({
      async queryFn({ input, id, image }, api) {
        const session = (api.getState() as RootState).auth;
        try {
          return { data: await saveBlog(input, id, image, contentRequest) };
        } catch (failure) {
          const status = failure instanceof ApiError ? failure.status : 0;
          if (status === 401 && (api.getState() as RootState).auth === session) {
            clearSession();
            api.dispatch(sessionEnded());
          }
          if (status === 403 && (api.getState() as RootState).auth === session) void api.dispatch(refreshProfile());
          return { error: { status, message: errorMessage(failure) } };
        }
      },
      invalidatesTags: (_result, error) => (!error || [404, 409].includes(error.status) ? ["Blog", "BlogAudit", "BlogTrash", "Comment", "Reaction", "Notification"] : []),
    }),
    changeBlogStatus: builder.mutation<
      Blog,
      { id: string; status: Blog["status"]; admin: boolean }
    >({
      query: ({ id, status, admin }) => ({
        route: admin
          ? `/admin/blogs/${encodeURIComponent(id)}/status`
          : `/blogs/${encodeURIComponent(id)}`,
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
      invalidatesTags: (_result, error) => (!error || [404, 409].includes(error.status) ? ["Blog", "BlogAudit", "BlogTrash", "Comment", "Reaction", "Notification"] : []),
    }),
    deleteBlog: builder.mutation<null, string | { id: string; version?: number }>({
      query: (post) => ({
        route: typeof post === "string" ? `/blogs/${encodeURIComponent(post)}` : `/blogs/${encodeURIComponent(post.id)}${queryString({ version: post.version })}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, error) => (!error || [404, 409].includes(error.status) ? ["Blog", "BlogAudit", "BlogTrash", "Comment", "Reaction", "Notification"] : []),
    }),
  }),
});
export const {
  useGetFeedInfiniteQuery,
  useGetMyBlogAuditLogsQuery,
  useGetMyBlogAuditLogQuery,
  useGetManagedBlogsQuery,
  useLazyGetEditableBlogQuery,
  useGetEditableBlogQuery,
  useGetBlogTrashQuery,
  useGetTrashedBlogQuery,
  useRestoreBlogMutation,
  usePurgeBlogMutation,
  useSaveBlogMutation,
  useChangeBlogStatusMutation,
  useDeleteBlogMutation,
} = blogApi;

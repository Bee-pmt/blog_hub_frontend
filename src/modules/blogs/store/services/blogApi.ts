import { baseApi } from "@/lib/api/baseApi";
import { queryString } from "@/lib/utils";
import type {
  Blog,
  BlogInput,
  BlogPage,
  BlogAuditLog,
  BlogAuditPage,
} from "../../types";
import { saveBlog } from "../../api";
import { ApiError, errorMessage } from "@/lib/api-client";
import { contentRequest } from "@/lib/content-client";
import { clearSession } from "@/lib/session";
import { sessionEnded } from "@/modules/auth/store/slices/authSlice";

export const blogApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
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
        try {
          return { data: await saveBlog(input, id, image, contentRequest) };
        } catch (failure) {
          const status = failure instanceof ApiError ? failure.status : 0;
          if (status === 401) {
            clearSession();
            api.dispatch(sessionEnded());
          }
          return { error: { status, message: errorMessage(failure) } };
        }
      },
      invalidatesTags: (_result, error) => (error ? [] : ["Blog", "BlogAudit"]),
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
      invalidatesTags: (_result, error) => (error ? [] : ["Blog", "BlogAudit"]),
    }),
    deleteBlog: builder.mutation<null, string>({
      query: (id) => ({
        route: `/blogs/${encodeURIComponent(id)}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, error) => (error ? [] : ["Blog", "BlogAudit"]),
    }),
  }),
});
export const {
  useGetMyBlogAuditLogsQuery,
  useGetMyBlogAuditLogQuery,
  useGetManagedBlogsQuery,
  useLazyGetEditableBlogQuery,
  useSaveBlogMutation,
  useChangeBlogStatusMutation,
  useDeleteBlogMutation,
} = blogApi;

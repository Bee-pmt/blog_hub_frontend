import { baseApi } from "@/lib/api/baseApi";
import type { BlogComment, CommentPage } from "../../types";

export const commentApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getComments: builder.query<CommentPage, { blogId: string; parentId?: string; page: number }>({
      query: ({ blogId, parentId, page }) => ({
        route: parentId
          ? `/comments/${encodeURIComponent(parentId)}/replies?page=${page}&limit=10`
          : `/blogs/${encodeURIComponent(blogId)}/comments?page=${page}&limit=10`,
        public: true,
      }),
      providesTags: (_result, _error, { blogId }) => [{ type: "Comment", id: blogId }],
    }),
    saveComment: builder.mutation<BlogComment, { blogId: string; parentId?: string; id?: string; content: string }>({
      query: ({ blogId, parentId, id, content }) => ({
        route: id
          ? `/comments/${encodeURIComponent(id)}`
          : parentId
            ? `/comments/${encodeURIComponent(parentId)}/replies`
            : `/blogs/${encodeURIComponent(blogId)}/comments`,
        method: id ? "PATCH" : "POST",
        body: JSON.stringify({ content: content.trim() }),
        direct: true,
      }),
      invalidatesTags: (_result, error, { blogId }) =>
        !error || error.status === 404 ? [{ type: "Comment", id: blogId }] : [],
    }),
    deleteComment: builder.mutation<null, { blogId: string; id: string }>({
      query: ({ id }) => ({
        route: `/comments/${encodeURIComponent(id)}`,
        method: "DELETE",
        direct: true,
      }),
      invalidatesTags: (_result, error, { blogId }) =>
        !error || error.status === 404 ? [{ type: "Comment", id: blogId }] : [],
    }),
  }),
});

export const { useGetCommentsQuery, useSaveCommentMutation, useDeleteCommentMutation } = commentApi;

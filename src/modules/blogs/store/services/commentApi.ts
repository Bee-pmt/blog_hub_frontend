import { baseApi } from "@/lib/api/baseApi";
import type { BlogComment, CommentPage, ReactionSummary, ReactionType } from "../../types";
import type { RootState } from "@/lib/store";

type ReactionTarget = { kind: "blogs" | "comments"; id: string; accountId?: string };

export const commentApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getReactions: builder.query<ReactionSummary, ReactionTarget>({
      query: ({ kind, id, accountId }) => ({
        route: `/${kind}/${encodeURIComponent(id)}/reactions`,
        public: !accountId,
      }),
      keepUnusedDataFor: 0,
      providesTags: ["Reaction"],
    }),
    react: builder.mutation<ReactionSummary, ReactionTarget & { accountId: string; type: ReactionType }>({
      query: ({ kind, id, type }) => ({
        route: `/${kind}/${encodeURIComponent(id)}/reactions`,
        method: "POST",
        body: JSON.stringify({ type }),
        direct: true,
        retryUnauthorized: false,
      }),
      async onQueryStarted({ kind, id, accountId }, { dispatch, queryFulfilled, getState }) {
        const session = (getState() as RootState).auth;
        try {
          const { data } = await queryFulfilled;
          if ((getState() as RootState).auth !== session) return;
          dispatch(commentApi.util.updateQueryData("getReactions", { kind, id, accountId }, () => data));
        } catch {
          // The buttons report errors and reconcile uncertain results with a GET.
        }
      },
    }),
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

export const {
  useGetCommentsQuery, useSaveCommentMutation, useDeleteCommentMutation,
  useGetReactionsQuery, useReactMutation,
} = commentApi;

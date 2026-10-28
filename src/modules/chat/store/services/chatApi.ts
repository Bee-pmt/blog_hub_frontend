import type { RootState } from "@/lib/store";
import { baseApi } from "@/lib/api/baseApi";
import { queryString } from "@/lib/utils";
import type { Conversation, ConversationPage, MessagePage } from "../../types";

export const chatApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getUnreadChatCount: builder.query<{ unreadCount: number }, void>({
      async queryFn(_input, api, _extra, baseQuery) {
        const owner = (api.getState() as RootState).auth.user;
        const counts = new Map<string, number>();
        let page = 1;
        let totalPages = 1;
        do {
          const current = (api.getState() as RootState).auth.user;
          if (api.signal.aborted || current?.id !== owner?.id || current?.role !== owner?.role)
            return { error: { status: 0, message: "The account changed." } };
          const result = await baseQuery({
            route: `/chat/conversations${queryString({ page, limit: 50 })}`,
          });
          if (result.error) return { error: result.error };
          const data = result.data as ConversationPage;
          for (const item of data.items) counts.set(item.id, item.unreadCount);
          totalPages = data.totalPages;
          page++;
        } while (page <= totalPages);
        return { data: { unreadCount: Array.from(counts.values()).reduce((total, count) => total + count, 0) } };
      },
      providesTags: ["Conversation"],
    }),
    createConversation: builder.mutation<Conversation, string>({
      query: (recipientId) => ({
        route: "/chat/conversations",
        method: "POST",
        body: JSON.stringify({ recipientId }),
        direct: true,
      }),
      invalidatesTags: ["Conversation"],
    }),
    getMessages: builder.query<
      MessagePage,
      { conversationId: string; page: number }
    >({
      query: ({ conversationId, page }) => ({
        route: `/chat/conversations/${encodeURIComponent(conversationId)}/messages${queryString({ page, limit: 20 })}`,
      }),
      providesTags: (_result, _error, { conversationId }) => [
        { type: "ChatMessage", id: conversationId },
      ],
    }),
    getConversations: builder.query<ConversationPage, number>({
      query: (page) => ({
        route: `/chat/conversations${queryString({ page, limit: 20 })}`,
      }),
      providesTags: ["Conversation"],
    }),
  }),
});

export const { useGetUnreadChatCountQuery, useGetConversationsQuery, useGetMessagesQuery, useCreateConversationMutation } = chatApi;

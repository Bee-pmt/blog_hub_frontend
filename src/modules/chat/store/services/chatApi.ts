import { baseApi } from "@/lib/api/baseApi";
import { queryString } from "@/lib/utils";
import type { Conversation, ConversationPage, MessagePage } from "../../types";

export const chatApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
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

export const { useGetConversationsQuery, useGetMessagesQuery, useCreateConversationMutation } = chatApi;

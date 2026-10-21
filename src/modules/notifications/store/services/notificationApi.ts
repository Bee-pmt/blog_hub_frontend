import { baseApi } from "@/lib/api/baseApi";
import type { Notification, NotificationPage } from "../../types";

export const notificationApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getNotifications: builder.query<NotificationPage, number>({
      query: (page) => ({ route: `/me/notifications?page=${page}&limit=10` }),
      providesTags: ["Notification"],
    }),
    markNotificationRead: builder.mutation<Notification, string>({
      query: (id) => ({
        route: `/me/notifications/${encodeURIComponent(id)}/read`,
        method: "PATCH",
        direct: true,
      }),
      invalidatesTags: (_result, error) => (error ? [] : ["Notification"]),
    }),
    markAllNotificationsRead: builder.mutation<
      { message: string; updated: number },
      void
    >({
      query: () => ({
        route: "/me/notifications/read-all",
        method: "PATCH",
        direct: true,
      }),
      invalidatesTags: (_result, error) => (error ? [] : ["Notification"]),
    }),
  }),
});

export const {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = notificationApi;

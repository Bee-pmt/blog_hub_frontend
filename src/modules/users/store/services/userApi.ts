import { refreshProfile } from "@/modules/auth/store/slices/authSlice";
import { baseApi } from "@/lib/api/baseApi";
import { queryString } from "@/lib/utils";
import type { ManagedUser, UserPage } from "../../types";
export const userApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getUsers: builder.query<UserPage, { q: string; page: number }>({
      query: ({ q, page }) => ({
        route: `/admin/users${queryString({ q, page, limit: 10 })}`,
      }),
      providesTags: ["User"],
    }),
    updateUser: builder.mutation<
      ManagedUser,
      {
        id: string;
        change:
          { role: "admin"; permissions?: string[] } | { permissions: string[] } | { status: ManagedUser["status"] };
      }
    >({
      query: ({ id, change }) => ({
        route: `/admin/users/${encodeURIComponent(id)}${"role" in change ? "" : "permissions" in change ? "/permissions" : "/status"}`,
        method: "PATCH",
        body: JSON.stringify(change),
        direct: true,
      }),
      async onQueryStarted(_args, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          await dispatch(refreshProfile());
        } catch {
          // The form reports failures; forbidden requests also refresh the profile.
        }
      },
      invalidatesTags: (_result, error) => (error ? [] : ["User"]),
    }),
  }),
});
export const { useGetUsersQuery, useUpdateUserMutation } = userApi;

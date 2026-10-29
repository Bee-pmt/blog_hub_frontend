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
          { role: ManagedUser["role"] } | { status: ManagedUser["status"] };
      }
    >({
      query: ({ id, change }) => ({
        route: `/admin/users/${encodeURIComponent(id)}${"role" in change ? "" : "/status"}`,
        method: "PATCH",
        body: JSON.stringify(change),
        direct: true,
      }),
      invalidatesTags: (_result, error) => (error ? [] : ["User"]),
    }),
  }),
});
export const { useGetUsersQuery, useUpdateUserMutation } = userApi;

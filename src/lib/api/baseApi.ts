"use client";
import { createApi } from "@reduxjs/toolkit/query/react";
import type { BaseQueryFn } from "@reduxjs/toolkit/query";
import { ApiError, errorMessage } from "@/lib/api-client";
import { authenticatedRequest, clearSession } from "@/lib/session";
import { contentRequest } from "@/lib/content-client";
import { sessionEnded } from "@/modules/auth/store/slices/authSlice";

export type RequestArgs = {
  route: string;
  method?: string;
  body?: string | FormData;
  direct?: boolean;
};
export type RequestError = { status: number; message: string };
const baseQuery: BaseQueryFn<RequestArgs, unknown, RequestError> = async (
  args,
  api,
) => {
  try {
    const send =
      args.direct || !args.method || args.method === "GET"
        ? authenticatedRequest
        : contentRequest;
    const data = await send(args.route, args.method || "GET", {
      body: args.body,
    });
    return { data: data ?? null };
  } catch (failure) {
    const status = failure instanceof ApiError ? failure.status : 0;
    if (status === 401) {
      clearSession();
      api.dispatch(sessionEnded());
    }
    return { error: { status, message: errorMessage(failure) } };
  }
};
export const baseApi = createApi({
  reducerPath: "bloghubApi",
  baseQuery,
  tagTypes: ["Blog", "Taxonomy", "User"],
  keepUnusedDataFor: 60,
  refetchOnMountOrArgChange: 60,
  endpoints: () => ({}),
});
export function queryError(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return error ? "Unable to load data. Please try again." : "";
}

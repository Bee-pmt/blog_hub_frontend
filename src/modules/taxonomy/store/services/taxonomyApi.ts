import { baseApi } from "@/lib/api/baseApi";
import { getTaxonomyAction } from "../../actions";
import type { Category, Tag, TaxonomyKind, TaxonomyInput } from "../../types";
export const taxonomyApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getTaxonomy: builder.query<{ categories: Category[]; tags: Tag[] }, void>({
      async queryFn() {
        try {
          const result = await getTaxonomyAction();
          return result.ok
            ? { data: result.data }
            : { error: { status: 0, message: result.error } };
        } catch {
          return {
            error: {
              status: 0,
              message: "Unable to load categories and tags.",
            },
          };
        }
      },
      providesTags: ["Taxonomy"],
    }),
    saveTaxonomy: builder.mutation<
      Category | Tag,
      { kind: TaxonomyKind; input: TaxonomyInput; id?: string }
    >({
      query: ({ kind, input, id }) => ({
        route: `/${kind}${id ? `/${encodeURIComponent(id)}` : ""}`,
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(input),
      }),
      invalidatesTags: (_result, error) => (error ? [] : ["Taxonomy", "Blog"]),
    }),
    deleteTaxonomy: builder.mutation<null, { kind: TaxonomyKind; id: string }>({
      query: ({ kind, id }) => ({
        route: `/${kind}/${encodeURIComponent(id)}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, error) => (error ? [] : ["Taxonomy", "Blog"]),
    }),
  }),
});
export const {
  useGetTaxonomyQuery,
  useLazyGetTaxonomyQuery,
  useSaveTaxonomyMutation,
  useDeleteTaxonomyMutation,
} = taxonomyApi;

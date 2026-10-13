import { createStore } from "zustand/vanilla";
import type {
  ApiRequest,
  Category,
  Tag,
  TaxonomyInput,
  TaxonomyKind,
} from "@/type/type";
import { deleteTaxonomy, errorMessage, saveTaxonomy } from "@/lib/api";
import { getTaxonomyAction } from "@/action/content";

export type TaxonomyState = {
  categories: Category[];
  tags: Tag[];
  loading: boolean;
  error: string;
  fetchedAt: number;
  load: (force?: boolean) => Promise<void>;
  save: (
    kind: TaxonomyKind,
    input: TaxonomyInput,
    api: ApiRequest,
    id?: string,
  ) => Promise<void>;
  remove: (kind: TaxonomyKind, id: string, api: ApiRequest) => Promise<void>;
  reset: () => void;
};

export function createTaxonomyStore(
  onChange: (kind: TaxonomyKind, id: string) => void,
) {
  let pending: Promise<void> | null = null;
  let generation = 0;
  let session = 0;
  return createStore<TaxonomyState>()((set, get) => ({
    categories: [],
    tags: [],
    loading: true,
    error: "",
    fetchedAt: 0,
    async load(force = false) {
      if (!force && get().fetchedAt && Date.now() - get().fetchedAt < 60000)
        return;
      if (pending && !force) return pending;
      const currentGeneration = ++generation;
      set({ loading: true, error: "" });
      const request = getTaxonomyAction()
        .then((result) => {
          if (generation !== currentGeneration)
            throw new Error("Content changed. Please try again.");
          if (!result.ok) throw new Error(result.error);
          set({
            ...result.data,
            loading: false,
            error: "",
            fetchedAt: Date.now(),
          });
        })
        .catch((error) => {
          if (generation === currentGeneration)
            set({ loading: false, error: errorMessage(error), fetchedAt: 0 });
          throw error;
        })
        .finally(() => {
          if (pending === request) pending = null;
        });
      pending = request;
      return request;
    },
    async save(kind, input, api, id) {
      const currentSession = session;
      await saveTaxonomy(kind, input, api, id);
      if (session !== currentSession) return;
      if (id) onChange(kind, id);
      // A failed follow-up read shows a retry message without reporting a saved write as failed.
      await get()
        .load(true)
        .catch(() => {});
    },
    async remove(kind, id, api) {
      const currentSession = session;
      await deleteTaxonomy(kind, id, api);
      if (session !== currentSession) return;
      onChange(kind, id);
      await get()
        .load(true)
        .catch(() => {});
    },
    reset() {
      session++;
      generation++;
      pending = null;
      set({ categories: [], tags: [], loading: true, error: "", fetchedAt: 0 });
    },
  }));
}

"use server";
import { errorMessage } from "@/lib/api-client";
import { getCachedTaxonomy } from "./cache";

export async function getTaxonomyAction() {
  try {
    return { ok: true as const, data: await getCachedTaxonomy() };
  } catch (error) {
    return { ok: false as const, error: errorMessage(error) };
  }
}

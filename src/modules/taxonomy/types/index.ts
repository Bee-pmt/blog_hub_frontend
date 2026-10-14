export type Category = {
  id: string;
  name: string;
  slug: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

export type Tag = Category & { categoryId: string };

export type TaxonomyInput = { name: string; categoryId?: string };

export type TaxonomyKind = "categories" | "tags";

export type TaxonomySelection = { item: Category; kind: TaxonomyKind };

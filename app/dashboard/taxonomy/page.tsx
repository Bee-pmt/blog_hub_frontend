import TaxonomyManager from "@/features/taxonomy/taxonomy-manager";
export default function TaxonomyPage() {
  return <TaxonomyManager />;
}

// Account guards resolve in the browser before this workspace is shown.
export const instant = false;

import type { ModuleManifest } from "@/moduleTypes";
import TaxonomyPage from "./pages/page";
const manifest: ModuleManifest = {
  id: "taxonomy",
  name: "Categories & tags",
  navItems: [{ label: "Categories & tags", href: "/dashboard/taxonomy" }],
  routes: [
    { path: "/dashboard/taxonomy", component: TaxonomyPage, access: "account" },
  ],
};
export default manifest;

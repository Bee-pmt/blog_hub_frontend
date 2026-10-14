import type { ModuleManifest } from "@/moduleTypes";
import Home from "./pages/Home";
import Article, { generateMetadata } from "./pages/Article";
const manifest: ModuleManifest = {
  id: "website",
  name: "Public journal",
  navItems: [],
  routes: [
    { path: "/", component: Home },
    { path: "/blogs/[slug]", component: Article, metadata: generateMetadata },
  ],
};
export default manifest;

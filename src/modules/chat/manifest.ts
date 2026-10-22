import type { ModuleManifest } from "@/moduleTypes";
import ConversationsPage from "./pages/page";

const manifest: ModuleManifest = {
  id: "chat",
  name: "Messages",
  navItems: [{ label: "Messages", href: "/dashboard/chat" }],
  routes: [
    {
      path: "/dashboard/chat",
      component: ConversationsPage,
      access: "account",
      title: "Messages",
    },
  ],
};
export default manifest;

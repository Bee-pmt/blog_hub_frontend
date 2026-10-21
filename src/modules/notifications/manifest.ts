import type { ModuleManifest } from "@/moduleTypes";
import NotificationsPage from "./pages/page";

const manifest: ModuleManifest = {
  id: "notifications",
  name: "Notifications",
  navItems: [],
  routes: [
    {
      path: "/dashboard/notifications",
      component: NotificationsPage,
      access: "account",
      title: "Notifications",
    },
  ],
};
export default manifest;

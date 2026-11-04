import type { ModuleManifest } from "@/moduleTypes";
import AdminUsersPage from "./pages/admin/page";
const manifest: ModuleManifest = {
  id: "users",
  name: "Users",
  navItems: [
    { label: "Users · Admin", href: "/dashboard/admin/users", admin: true, permission: "users.manage" },
  ],
  routes: [
    {
      path: "/dashboard/admin/users",
      component: AdminUsersPage,
      access: "admin",
      permission: "users.manage",
      title: "User management",
    },
  ],
};
export default manifest;

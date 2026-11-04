import type { ModuleManifest } from "@/moduleTypes";
import TrashPage, { AdminTrashPage } from "./pages/trash/page";
import StoriesPage from "./pages/page";
import NewPostPage from "./pages/new/page";
import EditPostPage from "./pages/[id]/edit/page";
import AdminPostsPage from "./pages/admin/page";
import LegacyAdminEditPage from "./pages/admin/[id]/edit/page";
import ActivityPage from "./pages/activity/page";
const manifest: ModuleManifest = {
  id: "blogs",
  name: "Stories",
  navItems: [
    { label: "My stories", href: "/dashboard" },
    { label: "Write a story", href: "/dashboard/posts/new" },
    { label: "My activity", href: "/dashboard/activity" },
    { label: "My Trash", href: "/dashboard/trash" },
    { label: "Admin Trash", href: "/dashboard/admin/trash", admin: true, permission: "blogs.moderate" },
    {
      label: "All stories · Admin",
      href: "/dashboard/admin/posts",
      admin: true,
      permission: "blogs.moderate",
    },
  ],
  routes: [
    { path: "/dashboard/trash", component: TrashPage, access: "account", title: "My Trash" },
    { path: "/dashboard/admin/trash", component: AdminTrashPage, access: "admin", permission: "blogs.moderate", title: "Admin Trash" },
    { path: "/dashboard", component: StoriesPage, access: "account" },
    { path: "/dashboard/posts/new", component: NewPostPage, access: "account" },
    {
      path: "/dashboard/activity",
      component: ActivityPage,
      access: "account",
      title: "My activity",
    },
    {
      path: "/dashboard/posts/[id]/edit",
      component: EditPostPage,
      access: "account",
    },
    {
      path: "/dashboard/admin/posts",
      component: AdminPostsPage,
      access: "admin",
      permission: "blogs.moderate",
    },
    {
      path: "/dashboard/admin/posts/[id]/edit",
      component: LegacyAdminEditPage,
      access: "admin",
      permission: "blogs.moderate",
    },
  ],
};
export default manifest;

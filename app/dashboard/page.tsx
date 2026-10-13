import PostManager from "@/features/blogs/post-manager";
export default function DashboardPage() {
  return <PostManager />;
}

// Account guards resolve in the browser before this workspace is shown.
export const instant = false;

import PostManager from "@/features/blogs/post-manager";
export default function AdminPostsPage() {
  return <PostManager admin />;
}

// Account guards resolve in the browser before this workspace is shown.
export const instant = false;

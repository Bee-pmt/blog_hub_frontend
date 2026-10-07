import PostEditor from "@/components/post-editor";
export default function NewPostPage() {
  return <PostEditor />;
}

// Account guards resolve in the browser before this workspace is shown.
export const instant = false;

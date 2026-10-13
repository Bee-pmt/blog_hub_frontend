import { Suspense } from "react";
import PostEditor from "@/features/blogs/post-editor";
async function Editor({ params }: PageProps<"/dashboard/posts/[id]/edit">) {
  const { id } = await params;
  return <PostEditor id={id} key={id} />;
}
export default function EditPostPage(
  props: PageProps<"/dashboard/posts/[id]/edit">,
) {
  return (
    <Suspense fallback={<p role="status">Opening story…</p>}>
      <Editor {...props} />
    </Suspense>
  );
}

// Account guards resolve in the browser before this workspace is shown.
export const instant = false;

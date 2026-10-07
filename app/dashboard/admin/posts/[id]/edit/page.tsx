import { Suspense } from "react";
import PostEditor from "@/components/post-editor";
async function Editor({
  params,
}: PageProps<"/dashboard/admin/posts/[id]/edit">) {
  const { id } = await params;
  return <PostEditor id={id} admin key={id} />;
}
export default function AdminEditPostPage(
  props: PageProps<"/dashboard/admin/posts/[id]/edit">,
) {
  return (
    <Suspense fallback={<p role="status">Opening story…</p>}>
      <Editor {...props} />
    </Suspense>
  );
}

// Account guards resolve in the browser before this workspace is shown.
export const instant = false;

import type { ModulePageProps } from "@/moduleTypes";
import { Suspense } from "react";
import PostEditor from "@/modules/blogs/components/post-editor";
async function Editor({ params }: ModulePageProps) {
  const { id } = await params;
  return <PostEditor id={id} key={id} />;
}
export default function EditPostPage(props: ModulePageProps) {
  return (
    <Suspense fallback={<p role="status">Opening story…</p>}>
      <Editor {...props} />
    </Suspense>
  );
}

// Account guards resolve in the browser before this workspace is shown.
export const instant = false;

import { redirect } from "next/navigation";

export default function AdminEditPostPage() {
  return redirect("/dashboard/admin/posts");
}

// Account guards resolve in the browser before this workspace is shown.
export const instant = false;

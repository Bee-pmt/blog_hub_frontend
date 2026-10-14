import { Suspense } from "react";
import type { Metadata } from "next";
import ModulePage, { resolveModuleRoute } from "@/moduleRegistry";

type Props = PageProps<"/[[...segments]]">;
async function RoutedPage({ params, searchParams }: Props) {
  const { segments = [] } = await params;
  return <ModulePage segments={segments} searchParams={searchParams} />;
}
export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { segments = [] } = await params;
  const resolved = resolveModuleRoute(segments);
  if (!resolved) return { title: "Page not found" };
  if (resolved.route.metadata)
    return resolved.route.metadata({
      params: Promise.resolve(resolved.params),
      searchParams,
    });
  return {
    ...(resolved.route.title ? { title: resolved.route.title } : {}),
    ...(resolved.route.access
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
export default function Page(props: Props) {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          className="site-container loading-state"
          role="status"
        >
          Opening BlogHub…
        </main>
      }
    >
      <RoutedPage {...props} />
    </Suspense>
  );
}
export const instant = false;

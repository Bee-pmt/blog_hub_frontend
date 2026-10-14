import { notFound } from "next/navigation";
import { allModules } from "@/lib/registry";
import type { ModulePageProps } from "@/moduleTypes";
import DashboardShell from "@/modules/base/components/dashboard-shell";

export function resolveModuleRoute(segments: string[]) {
  // Exact routes win before parameterized routes, regardless of module order.
  const routes = allModules.flatMap((module) => module.routes);
  const path = "/" + segments.join("/");
  const exact = routes.find((route) => route.path === path);
  if (exact) return { route: exact, params: {} as Record<string, string> };
  for (const route of routes) {
    const parts = route.path.split("/").filter(Boolean);
    if (parts.length !== segments.length) continue;
    const params: Record<string, string> = {};
    const matches = parts.every((part, i) => {
      if (part.startsWith("[") && part.endsWith("]")) {
        params[part.slice(1, -1)] = segments[i];
        return true;
      }
      return part === segments[i];
    });
    if (matches) return { route, params };
  }
  return null;
}
export default async function ModulePage({
  segments,
  searchParams,
}: {
  segments: string[];
  searchParams: ModulePageProps["searchParams"];
}) {
  const resolved = resolveModuleRoute(segments);
  if (!resolved) notFound();
  const Component = resolved.route.component;
  const page = (
    <Component
      params={Promise.resolve(resolved.params)}
      searchParams={searchParams}
    />
  );
  if (!resolved.route.access) return page;
  const navItems = allModules.flatMap((module) => module.navItems);
  // Preserve the existing workspace order while obtaining links from manifests.
  navItems.sort((a, b) => Number(!!a.admin) - Number(!!b.admin));
  return <DashboardShell navItems={navItems}>{page}</DashboardShell>;
}

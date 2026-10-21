import { describe, expect, it, vi } from "vitest";
vi.mock("@/modules/auth/google-actions", () => ({
  completeGoogleAction: vi.fn(), prepareGoogleAction: vi.fn(), startGoogleAction: vi.fn(),
}));
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  updateTag: vi.fn(),
}));
import { resolveModuleRoute } from "@/moduleRegistry";
import { allModules } from "@/lib/registry";

describe("module manifest routing", () => {
  it("resolves every existing BlogHub screen and extracts named parameters", () => {
    for (const path of [
      "/",
      "/login",
      "/register",
      "/forgot-password",
      "/settings",
      "/auth/google",
      "/dashboard",
      "/dashboard/posts/new",
      "/dashboard/activity",
      "/dashboard/notifications",
      "/dashboard/taxonomy",
      "/dashboard/admin/posts",
      "/dashboard/admin/users",
    ]) {
      expect(
        resolveModuleRoute(path.split("/").filter(Boolean))?.route.path,
      ).toBe(path);
    }
    expect(resolveModuleRoute(["blogs", "hello-world"])?.params).toEqual({
      slug: "hello-world",
    });
    expect(
      resolveModuleRoute(["dashboard", "posts", "post-id", "edit"])?.params,
    ).toEqual({ id: "post-id" });
  });
  it("keeps exact route priority, access rules and unknown routes", () => {
    expect(resolveModuleRoute(["dashboard", "posts", "new"])?.params).toEqual(
      {},
    );
    expect(
      resolveModuleRoute(["dashboard", "admin", "users"])?.route.access,
    ).toBe("admin");
    expect(resolveModuleRoute(["dashboard"])?.route.access).toBe("account");
    expect(resolveModuleRoute(["unknown"])).toBeNull();
    expect(
      resolveModuleRoute(["dashboard", "posts", "id", "edit", "extra"]),
    ).toBeNull();
  });
  it("registers unique routes and preserves all workspace navigation", () => {
    const paths = allModules.flatMap((module) =>
      module.routes.map((route) => route.path),
    );
    expect(new Set(paths).size).toBe(paths.length);
    expect(
      allModules.flatMap((module) => module.navItems.map((item) => item.href)),
    ).toEqual([
      "/dashboard",
      "/dashboard/posts/new",
      "/dashboard/activity",
      "/dashboard/admin/posts",
      "/dashboard/taxonomy",
      "/dashboard/admin/users",
    ]);
  });
});

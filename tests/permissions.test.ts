import { describe, expect, it } from "vitest";
import { hasPermission, assignablePermissions } from "@/modules/auth/permissions";
import type { User } from "@/modules/users/types";

describe("administrative grants", () => {
  it("defaults to no permissions for every role, including super admins", () => {
    for (const role of ["author", "admin", "super_admin"] as const) {
      const user = { role } as User;
      expect(hasPermission(user, "blogs.moderate")).toBe(false);
      expect(hasPermission({ ...user, permissions: ["blogs.moderate"] }, "blogs.moderate")).toBe(true);
      expect(hasPermission({ ...user, permissions: ["blogs.delete"] }, "blogs.restore")).toBe(false);
    }
    expect(hasPermission(null, "users.manage")).toBe(false);
  });
  it("never offers authority to grant access as an assignable permission", () => {
    expect(assignablePermissions).not.toContain("users.grant_access");
  });
});

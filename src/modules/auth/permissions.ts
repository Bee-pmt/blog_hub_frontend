import type { User } from "@/modules/users/types";

export const assignablePermissions = [
  "blogs.moderate", "blogs.delete", "blogs.restore", "blogs.purge",
  "taxonomy.manage", "taxonomy.delete", "comments.delete",
  "faqs.manage", "faqs.delete", "users.manage",
] as const;

// The profile grants are authoritative, including for super admins.
export function hasPermission(user: User | null | undefined, permission: string) {
  return user?.permissions?.includes(permission) ?? false;
}

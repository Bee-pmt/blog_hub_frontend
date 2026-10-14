import UserManager from "@/modules/users/components/user-manager";

export const metadata = { title: "User management" };
export default function AdminUsersPage() {
  return <UserManager />;
}
export const instant = false;

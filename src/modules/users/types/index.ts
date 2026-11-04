export type User = {
  id: string;
  displayName: string;
  email: string;
  role: "author" | "admin" | "super_admin";
  permissions?: string[];
  createdAt: string;
  updatedAt: string;
};

export type ManagedUser = User & { status: "active" | "disabled" };

export type UserPage = {
  items: ManagedUser[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

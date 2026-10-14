import type { ComponentType } from "react";
import type { Metadata } from "next";
export type ModulePageProps = {
  params: Promise<Record<string, string>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export type ModuleRoute = {
  path: string;
  component: ComponentType<ModulePageProps>;
  title?: string;
  access?: "account" | "admin";
  metadata?: (props: ModulePageProps) => Promise<Metadata>;
};
export type ModuleNavItem = { label: string; href: string; admin?: boolean };
export type ModuleManifest = {
  id: string;
  name: string;
  routes: ModuleRoute[];
  navItems: ModuleNavItem[];
};

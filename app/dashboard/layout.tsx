import DashboardShell from "@/components/dashboard-shell";
import { Suspense } from "react";
export const metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          className="site-container loading-state"
          role="status"
        >
          Opening your workspace…
        </main>
      }
    >
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}

// Account guards resolve in the browser before this workspace is shown.
export const instant = false;

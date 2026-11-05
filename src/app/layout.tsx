import type { Metadata } from "next";
import { Suspense, type CSSProperties } from "react";
import { Toaster } from "sonner";
import localFont from "next/font/local";
import Link from "next/link";
import { WorkspaceSidebar } from "@/modules/base/components/dashboard-shell";
import { allModules } from "@/lib/registry";
import ThemeSelect from "@/modules/base/components/theme-select";
import FaqHelp from "@/modules/base/components/faq-help";
import ReduxProvider from "@/lib/ReduxProvider";
import { AccountNav } from "@/modules/auth/components/account-nav";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "BlogHub — A place for thoughtful stories",
    template: "%s | BlogHub",
  },
  description: "A home for ideas, experiences, and stories worth sharing.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const navItems = allModules.flatMap(module => module.navItems)
    .sort((a, b) => Number(!!a.admin) - Number(!!b.admin));
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-theme="system"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme before the page paints. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try {
              const theme = localStorage.getItem("bloghub-theme");
              if (theme === "light" || theme === "dark") {
                document.documentElement.dataset.theme = theme;
              }
            } catch { /* System appearance works without storage. */ }`,
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
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
          <ReduxProvider>
            <header className="site-header">
              <div className="site-container header-inner">
                <div className="header-brand">
                  <Link className="wordmark" href="/" aria-label="BlogHub home">
                    BlogHub<span aria-hidden="true">.</span>
                  </Link>
                </div>
                <nav className="site-nav" aria-label="Main navigation">
                  <AccountNav />
                  <ThemeSelect />
                </nav>
              </div>
            </header>
            <div className="site-content">
              <WorkspaceSidebar navItems={navItems} />
              <div className="site-main">{children}</div>
            </div>
            <footer className="site-footer">
              <div className="site-container footer-inner">
                <Link className="wordmark footer-wordmark" href="/">
                  BlogHub.
                </Link>
                <p>Ideas find a home here.</p>
                <a className="text-link" href="#main-content">
                  Back to top <span aria-hidden="true">↑</span>
                </a>
              </div>
            </footer>
          </ReduxProvider>
        </Suspense>
        <FaqHelp />
        <Toaster
          position="top-right"
          closeButton
          style={
            {
              "--normal-bg": "var(--surface)",
              "--normal-text": "var(--foreground)",
              "--normal-border": "var(--border)",
            } as CSSProperties
          }
        />
      </body>
    </html>
  );
}

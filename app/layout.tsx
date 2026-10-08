import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Toaster } from "sonner";
import localFont from "next/font/local";
import Header from "@/components/header";
import Footer from "@/components/footer";
import AuthProvider from "@/components/auth-provider";
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
        <AuthProvider>
          <Header />
          {children}
          <Footer />
        </AuthProvider>
        <Toaster
          position="top-right"
          closeButton
          style={{
            "--normal-bg": "var(--surface)",
            "--normal-text": "var(--foreground)",
            "--normal-border": "var(--border)",
          } as CSSProperties}
        />
      </body>
    </html>
  );
}

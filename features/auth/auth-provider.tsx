"use client";
import type { ReactNode } from "react";

import type { Auth, AuthStore } from "@/types/models";
import { createContext, useContext, useEffect, useState } from "react";
import { useStore } from "zustand";
import Link from "next/link";
import { createAuthStore } from "./auth-store";
import { createBlogStore, type BlogState } from "@/features/blogs/blog-store";
import {
  createTaxonomyStore,
  type TaxonomyState,
} from "@/features/taxonomy/taxonomy-store";

const AuthContext = createContext<AuthStore | null>(null);
const ContentContext = createContext<{
  blogs: ReturnType<typeof createBlogStore>;
  taxonomy: ReturnType<typeof createTaxonomyStore>;
} | null>(null);

export function useBlogStore<T>(selector: (state: BlogState) => T) {
  const stores = useContext(ContentContext);
  if (!stores) throw new Error("AuthProvider is required");
  return useStore(stores.blogs, selector);
}

export function useTaxonomyStore<T>(selector: (state: TaxonomyState) => T) {
  const stores = useContext(ContentContext);
  if (!stores) throw new Error("AuthProvider is required");
  return useStore(stores.taxonomy, selector);
}

export function useAuth<T>(selector: (state: Auth) => T) {
  const store = useContext(AuthContext);
  if (!store) throw new Error("AuthProvider is required");
  return useStore(store, selector);
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createAuthStore);
  const [content] = useState(() => {
    const blogs = createBlogStore(() => store.getState().user?.id);
    return {
      blogs,
      taxonomy: createTaxonomyStore((kind, id) =>
        blogs.getState().invalidateTaxonomy(kind, id),
      ),
    };
  });
  useEffect(() => {
    // Clear private data synchronously when authentication changes, including other tabs.
    const unsubscribe = store.subscribe((state, previous) => {
      if (
        state.user?.id !== previous.user?.id ||
        state.user?.role !== previous.user?.role
      ) {
        content.blogs.getState().reset();
        content.taxonomy.getState().reset();
      }
    });
    const dispose = store.getState().initialize();
    return () => {
      dispose();
      unsubscribe();
      content.blogs.getState().reset();
      content.taxonomy.getState().reset();
    };
  }, [store, content]);
  return (
    <AuthContext.Provider value={store}>
      <ContentContext.Provider value={content}>
        {children}
      </ContentContext.Provider>
    </AuthContext.Provider>
  );
}

export function AccountNav() {
  const user = useAuth((state) => state.user);
  if (!user)
    return (
      <Link
        className="nav-account-button"
        href="/login"
        aria-label="Sign in"
        title="Sign in"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </svg>
      </Link>
    );
  return (
    <>
      <Link
        className="nav-account-button"
        href="/dashboard"
        aria-label="Profile"
        title={user.displayName}
      >
        <span aria-hidden="true">
          {Array.from(user.displayName.trim())[0]?.toLocaleUpperCase() || "U"}
        </span>
      </Link>
    </>
  );
}

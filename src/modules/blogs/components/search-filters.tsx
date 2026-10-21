"use client";
import type { Category, Tag } from "@/modules/taxonomy/types";
import type { Filters } from "@/modules/blogs/types";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { queryString } from "@/lib/utils";
import VoiceSearchButton from "@/modules/base/components/voice-search-button";

type SearchFiltersProps = {
  categories: Category[];
  tags: Tag[];
  filters: Filters;
};

export default function SearchFilters({
  categories,
  tags,
  filters,
}: SearchFiltersProps) {
  const router = useRouter();
  const [category, setCategory] = useState(filters.category || "");
  const [tag, setTag] = useState(filters.tag || "");
  const searchForm = useRef<HTMLFormElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const categoryId = categories.find((item) => item.slug === category)?.id;

  return (
    <form
      ref={searchForm}
      className="search-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        router.push(
          `/${queryString({ q: String(form.get("q") || ""), author: String(form.get("author") || ""), category, tag })}#journal`,
        );
      }}
    >
      <div className="search-primary">
        <label className="story-search">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            ref={searchInput}
            className="form-control"
            aria-label="Search stories"
            name="q"
            type="search"
            maxLength={200}
            defaultValue={filters.q}
            placeholder="Find your next great read…"
          />
        </label>
        <VoiceSearchButton
          className="button button-secondary voice-search-button"
          onResult={(text) => {
            if (!searchInput.current) return;
            searchInput.current.value = text.slice(0, 200);
            searchForm.current?.requestSubmit();
          }}
        />
        <button className="button button-primary" type="submit">
          Search <span aria-hidden="true">↗</span>
        </button>
      </div>
      <div className="search-refinements">
        <label>
          Category
          <select
            className="form-control"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setTag("");
            }}
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option value={item.slug} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tag
          <select
            className="form-control"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          >
            <option value="">All tags</option>
            {tags
              .filter((item) => !categoryId || item.categoryId === categoryId)
              .map((item) => (
                <option value={item.slug} key={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Author
          <input
            className="form-control"
            name="author"
            maxLength={100}
            defaultValue={filters.author}
            placeholder="Author name"
          />
        </label>
        <Link className="search-clear" href="/#journal">
          <span aria-hidden="true">↺</span> Clear filters
        </Link>
      </div>
    </form>
  );
}

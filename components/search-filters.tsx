"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Category, Tag, Filters, queryString } from "@/lib/api";

export default function SearchFilters({
  categories,
  tags,
  filters,
}: {
  categories: Category[];
  tags: Tag[];
  filters: Filters;
}) {
  const router = useRouter();
  const [category, setCategory] = useState(filters.category || "");
  const [tag, setTag] = useState(filters.tag || "");
  const categoryId = categories.find((item) => item.slug === category)?.id;
  return (
    <form
      className="search-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        router.push(
          `/${queryString({ q: String(form.get("q") || ""), author: String(form.get("author") || ""), category, tag })}#journal`,
        );
      }}
    >
      <label>
        Search stories
        <input
          className="form-control"
          name="q"
          type="search"
          maxLength={200}
          defaultValue={filters.q}
          placeholder="A title or an idea…"
        />
      </label>
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
      <div className="filter-actions">
        <button className="button button-primary" type="submit">
          Search
        </button>
        <Link className="text-link" href="/#journal">
          Clear
        </Link>
      </div>
    </form>
  );
}

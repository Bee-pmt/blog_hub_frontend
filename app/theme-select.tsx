"use client";

import { useEffect, useRef } from "react";

export default function ThemeSelect() {
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (selectRef.current) {
      selectRef.current.value =
        document.documentElement.dataset.theme ?? "system";
    }

    function syncTheme(event: StorageEvent) {
      if (event.key !== "bloghub-theme" && event.key !== null) return;
      const theme =
        event.newValue === "light" || event.newValue === "dark"
          ? event.newValue
          : "system";
      document.documentElement.dataset.theme = theme;
      if (selectRef.current) selectRef.current.value = theme;
    }

    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  return (
    <label className="theme-control">
      <span>Appearance</span>
      <select
        ref={selectRef}
        className="form-control theme-select"
        defaultValue="system"
        onChange={(event) => {
          const theme = event.target.value;
          document.documentElement.dataset.theme = theme;
          try {
            localStorage.setItem("bloghub-theme", theme);
          } catch {
            // The selected appearance still works when storage is unavailable.
          }
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}

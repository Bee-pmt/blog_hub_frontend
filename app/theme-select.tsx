"use client";

import { useEffect, useState } from "react";

export default function ThemeSelect() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    function syncSwitch() {
      const theme = document.documentElement.dataset.theme;
      setDark(theme === "dark" || (theme === "system" && systemTheme.matches));
    }
    function syncTheme(event: StorageEvent) {
      if (event.key !== "bloghub-theme" && event.key !== null) return;
      document.documentElement.dataset.theme =
        event.newValue === "light" || event.newValue === "dark"
          ? event.newValue
          : "system";
      syncSwitch();
    }
    // Read the saved browser preference after hydration.
    syncSwitch();
    window.addEventListener("storage", syncTheme);
    systemTheme.addEventListener("change", syncSwitch);
    return () => {
      window.removeEventListener("storage", syncTheme);
      systemTheme.removeEventListener("change", syncSwitch);
    };
  }, []);

  return (
    <button
      className="theme-switch"
      type="button"
      role="switch"
      aria-label="Dark mode"
      aria-checked={dark}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        const theme = dark ? "light" : "dark";
        setDark(!dark);
        document.documentElement.dataset.theme = theme;
        try {
          localStorage.setItem("bloghub-theme", theme);
        } catch {
          // The selected theme still works when storage is unavailable.
        }
      }}
    >
      <span className="theme-switch-track" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
        </svg>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M20 15.3A9 9 0 0 1 8.7 4a9 9 0 1 0 11.3 11.3Z" />
        </svg>
      </span>
    </button>
  );
}

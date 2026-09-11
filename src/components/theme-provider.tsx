"use client";

import { useEffect } from "react";
import { useTheme } from "@/store/theme-store";

export function ThemeProvider() {
  const theme = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;

    const updateBrowserChrome = () => {
      const background = getComputedStyle(root)
        .getPropertyValue("--background")
        .trim();
      for (const meta of document.querySelectorAll<HTMLMetaElement>(
        'meta[name="theme-color"]',
      )) {
        meta.content = background;
      }
    };

    updateBrowserChrome();

    if (theme !== "system") return;
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    colorScheme.addEventListener("change", updateBrowserChrome);
    return () => colorScheme.removeEventListener("change", updateBrowserChrome);
  }, [theme]);

  return null;
}

"use client";

import { useSyncExternalStore } from "react";

export const THEMES = [
  { id: "hackerman", label: "Hackerman" },
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const THEME_STORAGE_KEY = "bubbles-theme";
const DEFAULT_THEME: ThemeId = "hackerman";

let currentTheme: ThemeId = DEFAULT_THEME;
let initialized = false;
const listeners = new Set<() => void>();

function isTheme(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

function emitChange() {
  for (const listener of listeners) listener();
}

function getSnapshot(): ThemeId {
  if (!initialized && typeof window !== "undefined") {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    currentTheme = isTheme(stored) ? stored : DEFAULT_THEME;
    initialized = true;
  }
  return currentTheme;
}

function getServerSnapshot(): ThemeId {
  return DEFAULT_THEME;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  function syncFromStorage(event: StorageEvent) {
    if (event.key !== THEME_STORAGE_KEY) return;
    currentTheme = isTheme(event.newValue) ? event.newValue : DEFAULT_THEME;
    initialized = true;
    emitChange();
  }

  window.addEventListener("storage", syncFromStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", syncFromStorage);
  };
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setTheme(theme: ThemeId): void {
  currentTheme = theme;
  initialized = true;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  emitChange();
}

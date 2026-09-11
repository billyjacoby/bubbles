"use client";

import { useEffect } from "react";

/**
 * Register the service worker.
 *
 * Production only: in development a cached shell masks code changes and makes
 * hot reload behave unpredictably.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // An unavailable service worker costs offline support, nothing more.
      });
    };

    // Registering after load keeps it off the critical path for first paint.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}

import type { MetadataRoute } from "next";

/**
 * PWA manifest, served at /manifest.webmanifest.
 *
 * `display: standalone` is what makes a desktop install open in its own window
 * rather than a browser tab.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bubbles",
    short_name: "Bubbles",
    description: "A web client for BlueBubbles",
    start_url: "/chats",
    scope: "/",
    display: "standalone",
    background_color: "#0b0b0d",
    theme_color: "#0a84ff",
    orientation: "any",
    categories: ["social", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Padded artwork so a circular or squircle mask cannot clip the bubble.
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bubbles",
  description: "A web client for BlueBubbles",
  applicationName: "Bubbles",
  // Lets iOS open an added-to-home-screen app without Safari chrome.
  appleWebApp: {
    capable: true,
    title: "Bubbles",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  // Matches the manifest theme so the window chrome blends with the app.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
  ],
  width: "device-width",
  initialScale: 1,
  // A messaging UI is a fixed-height app shell, not a scrollable document.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full font-sans">
        <ThemeProvider />
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

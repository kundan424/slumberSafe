import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SlumberSafe — Bedside Debrief & Doomscroll Deterrent",
  description:
    "Private, screen-free bedside voice companion powered by open-weight AI. Empty your racing thoughts, lock away morning tasks, and ease into deep sleep.",
};

export const viewport: Viewport = {
  themeColor: "#030305",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased selection:bg-indigo-900 selection:text-indigo-100">
        {children}
      </body>
    </html>
  );
}

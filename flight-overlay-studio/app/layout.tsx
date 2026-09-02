import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flight Overlay Studio",
  description:
    "Create customizable paragliding photo and video overlays from an IGC flight log, entirely in your browser.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}

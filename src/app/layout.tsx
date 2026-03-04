import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Argus — AI Agent Observatory",
  description: "Full observability dashboard for OpenClaw AI agent activity",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

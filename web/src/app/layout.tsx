import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Change Detective",
  description: "Point it at a URL. It tells you what changed, and why it matters.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}

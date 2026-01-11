import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UniMemory",
  description: "AI memory management for your applications",
  icons: {
    icon: [
      {
        url: "/Unimemory Logo NoBG.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/UniMemory White NoBG.png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-white">
        {children}
      </body>
    </html>
  );
}


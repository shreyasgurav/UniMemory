import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UniMemory",
  description: "Your personal memory layer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Adedayo Aremu Autos",
  description: "Premium vehicle sales, rental and financing.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Dark is the default theme; the toggle swaps this attribute.
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}

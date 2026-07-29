import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoreWeave Pricing Tracker",
  description: "Track CoreWeave cloud pricing changes over time by region",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

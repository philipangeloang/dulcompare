import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import NavLinks from "@/components/NavLinks";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: "variable",
  style: ["normal"],
  variable: "--font-display",
  display: "swap",
});

const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ui",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "dulcompare",
  description: "Diff SEO metadata and dataLayer events between two sites.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-ui min-h-screen bg-canvas text-ink antialiased">
        <header className="sticky top-0 z-10 border-b border-border bg-canvas/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4 sm:px-10">
            <Link
              href="/"
              className="font-display text-xl font-semibold tracking-tight text-accent"
            >
              dulcompare
            </Link>
            <NavLinks />
          </div>
        </header>
        <main className="mx-auto max-w-[1200px] px-6 py-10 sm:px-10">
          {children}
        </main>
      </body>
    </html>
  );
}

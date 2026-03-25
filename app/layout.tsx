import type { Metadata } from "next";
import Link from "next/link";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import Script from "next/script";

import {
  BrandKnightIcon,
} from "@/components/app-icons";
import { SiteNav } from "@/components/site-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import "@/app/globals.css";

const displayFont = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-display"
});

const bodyFont = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  title: "ChessMe",
  description: "Personal chess trainer built from your own Chess.com games."
};

export default function RootLayout(props: Readonly<{ children: React.ReactNode }>) {
  const navLinks = [
    { href: "/", label: "Dashboard", icon: "dashboard" as const },
    { href: "/games", label: "Games", icon: "games" as const },
    { href: "/coach-lab", label: "Coach", icon: "coach" as const },
    { href: "/training", label: "Training", icon: "training" as const },
    { href: "/settings", label: "Settings", icon: "settings" as const }
  ];

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>
        <Script id="theme-init" strategy="beforeInteractive">
          {`try {
            var storedTheme = window.localStorage.getItem("chessme-theme");
            var theme = storedTheme === "dark" || storedTheme === "light"
              ? storedTheme
              : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
            document.documentElement.dataset.theme = theme;
          } catch (error) {
            document.documentElement.dataset.theme = "light";
          }`}
        </Script>
        <div className="shell">
          <header className="site-header">
            <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
              <div className="space-y-4">
                <Link className="flex items-center gap-4 font-display text-3xl" href="/">
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-[20px] panel-contrast shadow-card">
                    <BrandKnightIcon className="h-8 w-8" />
                  </span>
                  <span>
                    ChessMe
                    <span className="mt-1 block text-sm font-body font-semibold tracking-[0.12em] text-muted">
                      Personal trainer from your own games
                    </span>
                  </span>
                </Link>
                <SiteNav items={navLinks} />
              </div>
              <ThemeToggle />
            </div>
          </header>
          {props.children}
        </div>
      </body>
    </html>
  );
}

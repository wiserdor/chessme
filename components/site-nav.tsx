"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CoachIcon,
  DashboardIcon,
  GamesIcon,
  SettingsIcon,
  TrainingIcon
} from "@/components/app-icons";

type NavLinkItem = {
  href: string;
  label: string;
  icon: "dashboard" | "games" | "coach" | "training" | "settings";
};

const iconMap = {
  dashboard: DashboardIcon,
  games: GamesIcon,
  coach: CoachIcon,
  training: TrainingIcon,
  settings: SettingsIcon
} as const;

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav(props: { items: NavLinkItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-3 text-sm font-semibold">
      {props.items.map((item) => {
        const Icon = iconMap[item.icon];
        const active = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            className={`nav-pill ${active ? "nav-pill-active" : ""}`}
            href={item.href}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type SettingsTab = { href: string; label: string };

/**
 * Sub-nav for the workspace settings pages. The settings sub-pages (api-keys,
 * connected-apps, webhooks, sso) are otherwise only reachable by direct URL —
 * this exposes them. The visible tabs are decided server-side (role/edition) in
 * `settings/layout.tsx`; this component only renders + highlights the active one.
 */
export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-border pb-3 font-display text-[11px] font-medium uppercase tracking-[0.06em]">
      {tabs.map((tab) => {
        // General lives at the settings root; sub-pages match by prefix so a
        // deeper path still lights its tab. Guard against the root swallowing
        // every sub-page by requiring an exact match for it.
        const isRoot = tab.href.endsWith("/settings");
        const active = isRoot
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-3 py-1.5 rounded-sm transition-colors",
              active
                ? "bg-surface-2 text-foreground"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

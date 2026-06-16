"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Library, ShieldCheck, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BrandLogo } from "@/components/brand-logo";
import { UserMenu } from "@/components/user-menu";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LocaleSwitcher } from "@/components/locale-switcher";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type WorkspaceOption = { slug: string; name: string };

/**
 * Mobile-only chrome. The desktop top nav hides below `md`; on phones the whole
 * app shell collapses into a fixed bottom bar (logo · menu · user). The menu
 * sheet carries everything the top nav had no room for: workspace switching,
 * the Library/Admin links, and theme + locale controls.
 */
export function WorkspaceMobileNav({
  slug,
  workspace,
  workspaces,
  canAdmin,
  theme,
  user,
}: {
  slug: string;
  workspace: WorkspaceOption;
  workspaces: WorkspaceOption[];
  canAdmin: boolean;
  theme: Theme;
  user: { name: string | null; email: string; image: string | null };
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("navTop");
  const tw = useTranslations("workspaceSwitcher");

  const linkClass =
    "flex items-center gap-3 px-3 py-2.5 rounded-sm border border-border bg-surface hover:bg-surface-2 hover:border-border-strong transition-colors font-display text-sm font-medium uppercase tracking-[0.06em]";

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur h-14 flex items-center justify-between px-5">
        <BrandLogo size="sm" markOnly />
        <button
          type="button"
          aria-label={t("menu")}
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-sm border border-border bg-surface hover:bg-surface-2 hover:border-border-strong transition-colors font-display text-[11px] font-medium uppercase tracking-[0.06em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Menu className="size-4" />
          {t("menu")}
        </button>
        <UserMenu
          name={user.name}
          email={user.email}
          image={user.image}
          theme={theme}
        />
      </nav>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">{t("menu")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <div className="meta">{tw("label")}</div>
              <div className="space-y-1">
                {workspaces.map((ws) => (
                  <Link
                    key={ws.slug}
                    href={`/${ws.slug}`}
                    onClick={() => setOpen(false)}
                    className={cn(
                      linkClass,
                      "normal-case tracking-normal justify-between",
                    )}
                  >
                    <span className="inline-flex items-center gap-3">
                      <span className="size-5 rounded-xs bg-foreground text-background text-[10px] font-bold inline-flex items-center justify-center shrink-0">
                        {ws.name[0]?.toUpperCase() ?? "W"}
                      </span>
                      <span className="truncate">{ws.name}</span>
                    </span>
                    {ws.slug === workspace.slug && (
                      <Check className="size-4 text-primary shrink-0" />
                    )}
                  </Link>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Link
                href={`/${slug}`}
                onClick={() => setOpen(false)}
                className={linkClass}
              >
                <Library className="size-4" />
                {t("artifacts")}
              </Link>
              {canAdmin && (
                <Link
                  href={`/${slug}/settings`}
                  onClick={() => setOpen(false)}
                  className={linkClass}
                >
                  <ShieldCheck className="size-4" />
                  {t("admin")}
                </Link>
              )}
            </div>

            <div className="space-y-2">
              <div className="meta">{t("appearance")}</div>
              <div className="flex items-center gap-2">
                <ThemeSwitcher variant="nav-inline" current={theme} />
                <LocaleSwitcher variant="nav-inline" />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

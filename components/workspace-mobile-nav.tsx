"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Menu,
  Library,
  KeyRound,
  ShieldCheck,
  ChevronRight,
  Check,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { UserMenu } from "@/components/user-menu";
import { MobileQuickUpload } from "@/components/mobile-quick-upload";
import { setThemeAction } from "@/app/actions/theme";
import { setLocaleAction } from "@/app/actions/locale";
import { themes, type Theme } from "@/lib/theme";
import { locales } from "@/i18n/routing";
import { cn } from "@/lib/utils";

type WorkspaceOption = { slug: string; name: string };

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const;

/**
 * Mobile-only chrome. The desktop top nav hides below `md`; on phones the whole
 * app shell collapses into a fixed bottom bar (menu · new · user). The menu is
 * a bottom sheet using the iOS-style grouped-list pattern — rounded cards of
 * flush rows, not a stack of bordered buttons — covering workspace switching,
 * the Library/Admin links, and theme + locale.
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
  const [pending, start] = useTransition();
  const locale = useLocale();
  const t = useTranslations("navTop");
  const tw = useTranslations("workspaceSwitcher");
  const tTheme = useTranslations("themeSwitcher");
  const tLocale = useTranslations("localeSwitcher");

  function pickTheme(next: Theme) {
    if (next === theme) return;
    start(() => setThemeAction(next));
  }
  function pickLocale(next: string) {
    if (next === locale) return;
    start(() => setLocaleAction(next));
  }

  const groupClass =
    "rounded-xl border border-border bg-surface overflow-hidden divide-y divide-border";
  const rowClass =
    "flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface-2 active:bg-surface-2";

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur h-16 flex items-stretch">
        <button
          type="button"
          aria-label={t("menu")}
          onClick={() => setOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:bg-surface-2"
        >
          <Menu className="size-5" />
          <span className="text-[10px] font-display font-medium uppercase tracking-[0.06em]">
            {t("menu")}
          </span>
        </button>
        <MobileQuickUpload workspaceSlug={slug} />
        <div className="flex-1 flex items-center justify-center">
          <UserMenu
            name={user.name}
            email={user.email}
            image={user.image}
            theme={theme}
          />
        </div>
      </nav>

      <BottomSheet open={open} onOpenChange={setOpen} title={t("menu")}>
          <div className="max-h-[78vh] space-y-6 overflow-y-auto px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
            <section className="space-y-2">
              <h3 className="meta px-1">{tw("label")}</h3>
              <div className={groupClass}>
                {workspaces.map((ws) => {
                  const active = ws.slug === workspace.slug;
                  return (
                    <Link
                      key={ws.slug}
                      href={`/${ws.slug}`}
                      onClick={() => setOpen(false)}
                      className={rowClass}
                    >
                      <span className="size-7 rounded-md bg-foreground text-background text-xs font-bold inline-flex items-center justify-center shrink-0">
                        {ws.name[0]?.toUpperCase() ?? "W"}
                      </span>
                      <span
                        className={cn(
                          "flex-1 truncate",
                          active && "font-medium",
                        )}
                      >
                        {ws.name}
                      </span>
                      {active && (
                        <Check className="size-4 text-primary shrink-0" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="meta px-1">{t("navigate")}</h3>
              <div className={groupClass}>
                <Link
                  href={`/${slug}`}
                  onClick={() => setOpen(false)}
                  className={rowClass}
                >
                  <Library className="size-4 text-muted-foreground shrink-0" />
                  <span className="flex-1">{t("artifacts")}</span>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </Link>
                <Link
                  href={`/${slug}/settings/api-keys`}
                  onClick={() => setOpen(false)}
                  className={rowClass}
                >
                  <KeyRound className="size-4 text-muted-foreground shrink-0" />
                  <span className="flex-1">{t("mcp")}</span>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </Link>
                {canAdmin && (
                  <Link
                    href={`/${slug}/settings`}
                    onClick={() => setOpen(false)}
                    className={rowClass}
                  >
                    <ShieldCheck className="size-4 text-muted-foreground shrink-0" />
                    <span className="flex-1">{t("admin")}</span>
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                  </Link>
                )}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="meta px-1">{t("appearance")}</h3>
              <div className={groupClass}>
                <div className={cn(rowClass, "hover:bg-surface")}>
                  <span className="flex-1">{tTheme("label")}</span>
                  <div
                    className={cn(
                      "inline-flex gap-0.5 rounded-lg bg-surface-2 p-0.5",
                      pending && "opacity-60",
                    )}
                  >
                    {themes.map((code) => {
                      const Icon = THEME_ICON[code];
                      const active = code === theme;
                      return (
                        <button
                          key={code}
                          type="button"
                          aria-label={tTheme(code)}
                          aria-pressed={active}
                          disabled={pending}
                          onClick={() => pickTheme(code)}
                          className={cn(
                            "size-8 rounded-md flex items-center justify-center transition-colors",
                            active
                              ? "bg-surface text-foreground ring-1 ring-border"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className={cn(rowClass, "hover:bg-surface")}>
                  <span className="flex-1">{tLocale("label")}</span>
                  <div
                    className={cn(
                      "inline-flex gap-0.5 rounded-lg bg-surface-2 p-0.5",
                      pending && "opacity-60",
                    )}
                  >
                    {locales.map((code) => {
                      const active = code === locale;
                      return (
                        <button
                          key={code}
                          type="button"
                          aria-pressed={active}
                          disabled={pending}
                          onClick={() => pickLocale(code)}
                          className={cn(
                            "h-8 px-3 rounded-md text-xs font-display font-medium uppercase tracking-[0.06em] transition-colors",
                            active
                              ? "bg-surface text-foreground ring-1 ring-border"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {code}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </div>
      </BottomSheet>
    </>
  );
}

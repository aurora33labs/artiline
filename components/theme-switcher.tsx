"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setThemeAction } from "@/app/actions/theme";
import { themes, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type Variant = "menu-item" | "footer-chip" | "nav-inline";

const ICON = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

export function ThemeSwitcher({
  variant = "menu-item",
  current,
}: {
  variant?: Variant;
  current: Theme;
}) {
  const t = useTranslations("themeSwitcher");
  const [pending, start] = useTransition();
  const Icon = ICON[current];

  function pick(next: Theme) {
    if (next === current) return;
    start(async () => {
      await setThemeAction(next);
    });
  }

  const triggerClass =
    variant === "footer-chip"
      ? cn(
          "inline-flex items-center gap-1.5 border border-border bg-background/95 backdrop-blur px-2.5 py-2 rounded-sm font-display text-[11px] font-medium uppercase tracking-[0.06em] hover:border-border-strong transition-colors",
          pending && "opacity-60",
        )
      : variant === "nav-inline"
        ? cn(
            "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-sm border border-border bg-surface hover:bg-surface-2 hover:border-border-strong transition-colors font-display text-[11px] font-medium uppercase tracking-[0.06em]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            pending && "opacity-60",
          )
        : cn(
            "w-full flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer",
            pending && "opacity-60",
          );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("label")}
          disabled={pending}
          className={triggerClass}
        >
          <Icon className="size-4" />
          <span>{t(current)}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === "footer-chip" ? "start" : "end"}
        className="w-40"
      >
        <DropdownMenuLabel className="meta">{t("label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {themes.map((code) => {
          const I = ICON[code];
          return (
            <DropdownMenuItem
              key={code}
              onClick={() => pick(code)}
              className="cursor-pointer"
            >
              <I className="size-4" />
              <span className="flex-1">{t(code)}</span>
              {code === current && <Check className="size-3.5 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

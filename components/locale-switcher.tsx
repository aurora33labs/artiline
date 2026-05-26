"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Languages, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setLocaleAction } from "@/app/actions/locale";
import { locales } from "@/i18n/routing";
import { cn } from "@/lib/utils";

type Variant = "menu-item" | "footer-chip" | "nav-inline";

export function LocaleSwitcher({ variant = "menu-item" }: { variant?: Variant }) {
  const locale = useLocale();
  const t = useTranslations("localeSwitcher");
  const [pending, start] = useTransition();

  function pick(next: string) {
    if (next === locale) return;
    start(async () => {
      await setLocaleAction(next);
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
          <Languages className="size-4" />
          <span>{locale.toUpperCase()}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === "footer-chip" ? "start" : "end"}
        className="w-40"
      >
        <DropdownMenuLabel className="meta">{t("label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {locales.map((code) => (
          <DropdownMenuItem
            key={code}
            onClick={() => pick(code)}
            className="cursor-pointer"
          >
            <span className="flex-1">{t(code)}</span>
            {code === locale && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

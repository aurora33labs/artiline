"use client";

import { useTransition } from "react";
import { LogOut, User, Languages, Check, Sun, Moon, Monitor, Palette } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/actions/auth";
import { setLocaleAction } from "@/app/actions/locale";
import { setThemeAction } from "@/app/actions/theme";
import { locales } from "@/i18n/routing";
import { themes, type Theme } from "@/lib/theme";

const THEME_ICON = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

function initial(name: string | null | undefined, email: string) {
  const src = (name ?? email).trim();
  return (src[0] ?? "?").toUpperCase();
}

export function UserMenu({
  name,
  email,
  image,
  theme,
}: {
  name: string | null;
  email: string;
  image: string | null;
  theme: Theme;
}) {
  const t = useTranslations("userMenu");
  const tLang = useTranslations("localeSwitcher");
  const tTheme = useTranslations("themeSwitcher");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const ActiveThemeIcon = THEME_ICON[theme];

  function pickLocale(next: string) {
    if (next === locale) return;
    start(async () => {
      await setLocaleAction(next);
    });
  }

  function pickTheme(next: Theme) {
    if (next === theme) return;
    start(async () => {
      await setThemeAction(next);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("label")}
          className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus:outline-none transition-colors"
        >
          <Avatar size="default" className="rounded-sm">
            {image && <AvatarImage src={image} alt={name ?? email} className="rounded-sm" />}
            <AvatarFallback className="bg-primary text-primary-foreground font-display font-bold rounded-sm text-sm">
              {initial(name, email)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            {name && <span className="text-sm font-medium">{name}</span>}
            <span className="text-xs text-muted-foreground truncate">
              {email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <User className="size-4" />
          {t("profileSoon")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={pending}>
            <Languages className="size-4" />
            {tLang("label")}
            <span className="ml-auto meta">{locale.toUpperCase()}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            {locales.map((code) => (
              <DropdownMenuItem
                key={code}
                onClick={() => pickLocale(code)}
                className="cursor-pointer"
              >
                <span className="flex-1">{tLang(code)}</span>
                {code === locale && <Check className="size-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={pending}>
            <Palette className="size-4" />
            {tTheme("label")}
            <ActiveThemeIcon className="ml-auto size-3.5 text-muted-foreground" />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            {themes.map((code) => {
              const I = THEME_ICON[code];
              return (
                <DropdownMenuItem
                  key={code}
                  onClick={() => pickTheme(code)}
                  className="cursor-pointer"
                >
                  <I className="size-4" />
                  <span className="flex-1">{tTheme(code)}</span>
                  {code === theme && <Check className="size-3.5 text-primary" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full cursor-pointer">
              <LogOut className="size-4" />
              {t("signOut")}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

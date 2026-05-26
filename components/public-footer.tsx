import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { resolveTheme } from "@/lib/theme.server";

export async function PublicFooter() {
  const t = await getTranslations("publicFooter");
  const theme = await resolveTheme();
  return (
    <div className="fixed left-4 bottom-4 z-30 flex items-center gap-2">
      <Link
        href="/?utm_source=shared_artifact"
        className="group inline-flex items-center gap-2 border border-border bg-background/95 backdrop-blur px-3 py-2 rounded-sm font-display text-[11px] font-medium uppercase tracking-[0.06em] hover:border-border-strong transition-colors"
      >
        <span className="size-4 bg-primary text-primary-foreground inline-flex items-center justify-center rounded-xs text-[9px] font-bold">
          A
        </span>
        <span>{t("hosted")}</span>
        <ArrowUpRight className="size-3 text-muted-foreground group-hover:text-foreground transition-colors" />
      </Link>
      <ThemeSwitcher variant="footer-chip" current={theme} />
      <LocaleSwitcher variant="footer-chip" />
    </div>
  );
}

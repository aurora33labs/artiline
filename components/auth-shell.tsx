import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/brand-logo";

export async function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = await getTranslations("authShell");
  return (
    <div className="flex-1 grid lg:grid-cols-[1fr_minmax(0,520px)] min-h-screen">
      <aside className="hidden lg:flex relative overflow-hidden bg-surface border-r border-border">
        <div className="relative flex flex-col justify-between p-12 w-full">
          <BrandLogo size="md" />

          <div className="space-y-10 max-w-md">
            <div className="meta">{t("edition")}</div>
            <blockquote className="text-2xl leading-snug text-foreground">
              {t("quote")}
            </blockquote>
            <div className="grid grid-cols-3 gap-px border border-border bg-border">
              <Stat number="01" label={t("drop")} />
              <Stat number="02" label={t("link")} />
              <Stat number="03" label={t("ship")} />
            </div>
          </div>

          <p className="meta">{t("tagline")}</p>
        </div>
      </aside>

      <main className="flex flex-col justify-center px-6 py-12 lg:px-12">
        <div className="lg:hidden mb-8">
          <BrandLogo size="md" />
        </div>
        <div className="w-full max-w-md mx-auto space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl">{title}</h1>
            {subtitle && (
              <p className="text-muted-foreground text-sm">{subtitle}</p>
            )}
          </div>
          {children}
          {footer && (
            <p className="text-sm text-muted-foreground text-center pt-4 border-t border-border">
              {footer}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div className="bg-surface p-4 space-y-1">
      <div className="font-display font-bold text-2xl">{number}</div>
      <div className="meta">{label}</div>
    </div>
  );
}

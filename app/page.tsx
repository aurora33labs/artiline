import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { resolveTheme } from "@/lib/theme.server";
import { auth } from "@/auth";
import { getMyWorkspaces } from "@/lib/tenant";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session?.user?.id) {
    const workspaces = await getMyWorkspaces(session.user.id);
    if (workspaces.length === 1) redirect(`/${workspaces[0].slug}`);
    if (workspaces.length > 1) redirect(`/workspaces`);
    redirect(`/signup/workspace`);
  }

  const t = await getTranslations("landing");
  const theme = await resolveTheme();

  return (
    <div className="flex flex-1 flex-col">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto w-full border-b border-border">
        <BrandLogo size="md" />
        <div className="flex items-center gap-2">
          <ThemeSwitcher variant="nav-inline" current={theme} />
          <LocaleSwitcher variant="nav-inline" />
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">{t("headerLogin")}</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 relative">
        <div className="max-w-6xl mx-auto px-6 py-20 lg:py-28">
          <div className="grid lg:grid-cols-12 gap-12">
            <div className="lg:col-span-7 space-y-10">
              <div className="meta">{t("edition")}</div>

              <h1 className="text-4xl lg:text-6xl !normal-case !tracking-tight !leading-[0.95] font-display font-bold">
                {t("heroLine1")}
                <br />
                {t("heroLine2")}
                <br />
                {t("heroLine3")}
                <br />
                {t("heroLine4")}
              </h1>

              <div className="grid grid-cols-3 gap-px bg-border border border-border max-w-md">
                <Cell n="01" label={t("drop")} sub={t("dropSub")} />
                <Cell n="02" label={t("link")} sub={t("linkSub")} />
                <Cell n="03" label={t("ship")} sub={t("shipSub")} />
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button asChild size="lg">
                  <Link href="/signup">
                    {t("ctaCreate")}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost">
                  <Link href="/login">{t("ctaLogin")}</Link>
                </Button>
              </div>

              <p className="meta">{t("noCard")}</p>
            </div>

            <aside className="lg:col-span-5 hidden lg:block">
              <CatalogPanel />
            </aside>
          </div>
        </div>

        <section className="border-t border-border">
          <div className="max-w-6xl mx-auto px-6 py-16 grid lg:grid-cols-3 gap-px bg-border border border-border">
            <Tile
              title={t("multiTenantTitle")}
              body={t("multiTenantBody")}
            />
            <Tile
              title={t("visibilityTitle")}
              body={t("visibilityBody")}
            />
            <Tile
              title={t("exportTitle")}
              body={t("exportBody")}
            />
          </div>
        </section>

        <footer className="border-t border-border">
          <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4">
            <BrandLogo size="sm" />
            <p className="meta">{t("footerTagline")}</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

function Cell({ n, label, sub }: { n: string; label: string; sub: string }) {
  return (
    <div className="bg-background p-4 space-y-1.5">
      <div className="font-display font-bold text-xl">{n}</div>
      <div className="meta">{label}</div>
      <div className="meta !text-[9px] text-muted-foreground/70">{sub}</div>
    </div>
  );
}

function Tile({ title, body }: { title: string; body: string }) {
  return (
    <article className="bg-background p-6 space-y-3">
      <h3 className="text-base font-sans font-semibold normal-case tracking-normal">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </article>
  );
}

async function CatalogPanel() {
  const t = await getTranslations("landing");
  const rows = [
    {
      n: "#047",
      title: "campaign-hero-v3.html",
      meta: "HTML · 2.4KB · 142 VIEWS",
    },
    { n: "#046", title: "brief-q2-draft.md", meta: "MD · 1.1KB · 89 VIEWS" },
    { n: "#045", title: "generate.ts", meta: "TS · 320B · 23 VIEWS" },
    {
      n: "#044",
      title: "landing-experiment.html",
      meta: "HTML · 4.2KB · 67 VIEWS",
    },
    { n: "#043", title: "post-template.mdx", meta: "MDX · 890B · 31 VIEWS" },
  ];
  return (
    <div className="border border-border bg-surface">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="meta">{t("panelHeader")}</span>
        <span className="meta text-primary">{t("panelCount")}</span>
      </div>
      <ul>
        {rows.map((r, i) => (
          <li
            key={r.n}
            className={`px-4 py-3 grid grid-cols-[auto_1fr] gap-x-3 ${i > 0 ? "border-t border-border" : ""}`}
          >
            <span className="font-display font-bold text-xs text-muted-foreground tabular-nums">
              {r.n}
            </span>
            <div className="space-y-0.5 min-w-0">
              <div className="font-mono text-xs truncate">{r.title}</div>
              <div className="meta">{r.meta}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="px-4 py-3 border-t border-border">
        <span className="meta text-muted-foreground/70">{t("panelMock")}</span>
      </div>
    </div>
  );
}

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { resolveTheme } from "@/lib/theme.server";
import { type DropDemoStrings } from "@/components/landing/drop-demo";
import {
  VisibilityDial,
  type VisibilityDialStrings,
} from "@/components/landing/visibility-dial";
import { Hero, type HeroStrings } from "@/components/landing/hero";
import { SmoothScroll } from "@/components/landing/smooth-scroll";

export async function MarketingHome() {
  const t = await getTranslations("landing");
  const theme = await resolveTheme();

  const demoStrings: DropDemoStrings = {
    placeholder: t("demoPlaceholder"),
    hint: t("demoHint"),
    drop: t("demoDrop"),
    dropTitle: t("demoDropTitle"),
    dropBrowse: t("demoDropBrowse"),
    dropPaste: t("demoDropPaste"),
    dropBack: t("demoDropBack"),
    viewPreview: t("demoViewPreview"),
    viewCode: t("demoViewCode"),
    tryExample: t("tryExample"),
    previewEmpty: t("previewEmpty"),
    tooBig: t("tooBig"),
    externalBlocked: t("externalBlocked"),
    lockedLink: t("lockedLink"),
    lockedCta: t("lockedCta"),
    ephemeral: t("ephemeral"),
    typeLabel: { html: "HTML", markdown: "MARKDOWN", code: "CODE" },
  };

  const dialStrings: VisibilityDialStrings = {
    recipientLabel: t("s4RecipientLabel"),
    madeWith: t("madeWith"),
    levels: [
      { key: "team", name: t("lvlTeam"), desc: t("lvlTeamDesc"), view: t("lvlTeamView") },
      { key: "team_pw", name: t("lvlTeamPw"), desc: t("lvlTeamPwDesc"), view: t("lvlTeamPwView") },
      { key: "public", name: t("lvlPublic"), desc: t("lvlPublicDesc"), view: t("lvlPublicView") },
      { key: "public_pw", name: t("lvlPublicPw"), desc: t("lvlPublicPwDesc"), view: t("lvlPublicPwView") },
    ],
  };

  const heroStrings: HeroStrings = {
    h1: t("heroH1"),
    sub: t("heroSub"),
    ctaCreate: t("ctaCreate"),
    ctaLogin: t("ctaLogin"),
    noCard: t("noCard"),
    demoTag: t("demoTag"),
  };

  return (
    <SmoothScroll>
    <div className="flex flex-1 flex-col">
      {/* ── Header ── */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <BrandLogo size="md" />
        <div className="flex items-center gap-1.5">
          <ThemeSwitcher variant="nav-inline" current={theme} />
          <LocaleSwitcher variant="nav-inline" />
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">{t("headerLogin")}</Link>
          </Button>
        </div>
      </header>

      {/* ── 1 · Hero — animated (GSAP load timeline + catalog wall) ── */}
      <Hero s={heroStrings} demo={demoStrings} />

      {/* ── 2 · Artifact lifecycle (how it works) ── */}
      <Section tag={t("s3Tag")} pad="pt-32 pb-16 lg:pt-40 lg:pb-20">
        <SectionHead title={t("s3H")} />
        <ol className="mt-8 grid gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          <LifecycleStep n="1" title={t("s3Step1T")} body={t("s3Step1B")} />
          <LifecycleStep n="2" title={t("s3Step2T")} body={t("s3Step2B")} />
          <LifecycleStep n="3" title={t("s3Step3T")} body={t("s3Step3B")} />
          <LifecycleStep n="4" title={t("s3Step4T")} body={t("s3Step4B")} />
        </ol>
      </Section>

      {/* ── 3 · Visibility levels (interactive) ── */}
      <Section tag={t("s4Tag")}>
        <SectionHead title={t("s4H")} body={t("s4Sub")} />
        <div className="mt-8">
          <VisibilityDial s={dialStrings} />
        </div>
      </Section>

      {/* ── 4 · Use cases ── */}
      <Section tag={t("s5Tag")}>
        <SectionHead title={t("s5H")} />
        <div className="mt-8 divide-y divide-border border-y border-border">
          <UseCase
            role={t("case1Role")}
            level={t("case1Level")}
            body={t("case1Body")}
          />
          <UseCase
            role={t("case2Role")}
            level={t("case2Level")}
            body={t("case2Body")}
          />
          <UseCase
            role={t("case3Role")}
            level={t("case3Level")}
            body={t("case3Body")}
          />
        </div>
      </Section>

      {/* ── 5 · Final CTA ── */}
      <section>
        <div className="mx-auto max-w-6xl px-6 py-20 lg:py-28">
          <div className="max-w-[40rem] space-y-6">
            <h2
              className="font-display font-extrabold leading-[1.05] tracking-[-0.03em]"
              style={{ fontSize: "clamp(1.5rem, 4vw, 3rem)" }}
            >
              {t("ctaFinalH")}
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-auto gap-2 px-7 py-3.5 text-lg">
                <Link href="/signup">
                  {t("ctaCreate")}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="text-lg">
                <Link href="/login">{t("ctaLogin")}</Link>
              </Button>
            </div>
            <p className="meta">{t("noCard")}</p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-5">
          <p className="meta">{t("footerTagline")}</p>
          <p className="meta">{t("builtBy")}</p>
        </div>
      </footer>
    </div>
    </SmoothScroll>
  );
}

/* ── Section primitives ── */

function Section({
  tag,
  pad = "py-16 lg:py-20",
  children,
}: {
  tag: string;
  pad?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className={`mx-auto max-w-6xl px-6 ${pad}`}>
        <span className="meta text-primary">{tag}</span>
        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}

function SectionHead({ title, body }: { title: string; body?: string }) {
  return (
    <div className="max-w-[44rem]">
      <h2
        className="font-display font-bold leading-[1.1] tracking-[-0.02em]"
        style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}
      >
        {title}
      </h2>
      {body && (
        <p className="mt-4 max-w-[65ch] text-base leading-relaxed text-muted-foreground">
          {body}
        </p>
      )}
    </div>
  );
}

function LifecycleStep({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <li className="bg-background p-5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-sm font-semibold tabular-nums text-primary">
          {n}
        </span>
        <h3 className="font-mono text-sm font-semibold uppercase tracking-[0.04em]">
          {title}
        </h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </li>
  );
}

function UseCase({
  role,
  level,
  body,
}: {
  role: string;
  level: string;
  body: string;
}) {
  return (
    <div className="grid gap-3 py-6 lg:grid-cols-12 lg:gap-8">
      <div className="lg:col-span-4">
        <h3 className="text-base font-semibold leading-snug">{role}</h3>
        <span className="meta mt-1.5 inline-block text-primary">{level}</span>
      </div>
      <p className="max-w-[60ch] text-base leading-relaxed text-muted-foreground lg:col-span-8">
        {body}
      </p>
    </div>
  );
}


import Link from "next/link";
import {
  ArrowRight,
  Hash,
  ShieldOff,
  WifiOff,
  Cookie,
  Box,
  Heart,
  MessageSquare,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { resolveTheme } from "@/lib/theme.server";
import { DropDemo, type DropDemoStrings } from "@/components/landing/drop-demo";
import {
  VisibilityDial,
  type VisibilityDialStrings,
} from "@/components/landing/visibility-dial";

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

  return (
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

      {/* ── 1 · Hero — pain-first, left-aligned ── */}
      <section className="mx-auto w-full max-w-6xl px-6 pt-10 lg:pt-16">
        <div className="max-w-[46rem] space-y-5">
          <h1
            className="font-display font-extrabold leading-[1.04] tracking-[-0.03em]"
            style={{ fontSize: "clamp(2rem, 5vw, 4rem)" }}
          >
            {t("heroH1")}
          </h1>
          <p className="max-w-[54ch] text-base leading-relaxed text-muted-foreground">
            {t("heroSub")}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button asChild size="lg" className="gap-2">
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

        {/* Product mockup — window-framed live demo */}
        <div className="mt-12 w-full">
          <div className="flex h-9 items-center justify-between rounded-t-sm border border-b-0 border-border-strong bg-surface px-4">
            <div className="flex items-center gap-1.5">
              <span className="block h-2.5 w-2.5 rounded-full border border-border-strong" />
              <span className="block h-2.5 w-2.5 rounded-full border border-border-strong" />
              <span className="block h-2.5 w-2.5 rounded-full border border-border-strong" />
            </div>
            <span className="meta">{t("demoTag")}</span>
          </div>
          <div className="overflow-hidden rounded-b-sm border border-border-strong">
            <DropDemo s={demoStrings} />
          </div>
        </div>
      </section>

      {/* ── 2 · The broken ritual ── */}
      <Section tag={t("s2Tag")}>
        <SectionHead title={t("s2H")} body={t("s2Body")} />
        <div className="mt-8 grid gap-px overflow-hidden rounded border border-border bg-border md:grid-cols-2">
          {/* Before — messy Slack thread */}
          <div className="bg-background p-5">
            <span className="meta">{t("s2BeforeLabel")}</span>
            <ul className="mt-4 space-y-2.5">
              <ChatBubble name="tú" muted>
                {t("s2Msg1")}
              </ChatBubble>
              <ChatBubble name="CMO" muted>
                {t("s2Msg2")}
              </ChatBubble>
              <ChatBubble name="cliente" muted>
                {t("s2Msg3")}
              </ChatBubble>
            </ul>
          </div>
          {/* After — one clean catalog row */}
          <div className="flex flex-col justify-center bg-surface p-5">
            <span className="meta">{t("s2AfterLabel")}</span>
            <div className="mt-4 flex items-center gap-3 rounded-sm border border-border bg-background px-3 py-3">
              <Hash className="size-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs text-muted-foreground">
                  <span className="tabular-nums">047</span> · HTML · 2.4KB · 142 VIEWS
                </div>
                <div className="truncate font-mono text-sm">
                  artiline.app/a/x7k2qd
                </div>
              </div>
              <span className="rounded-xs border border-border-strong px-1.5 py-0.5 text-xs font-medium uppercase tracking-[0.06em] text-primary">
                {t("s2Badge")}
              </span>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 3 · Artifact lifecycle ── */}
      <Section tag={t("s3Tag")} surface>
        <SectionHead title={t("s3H")} />
        <ol className="mt-8 grid gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          <LifecycleStep n="1" title={t("s3Step1T")} body={t("s3Step1B")} />
          <LifecycleStep n="2" title={t("s3Step2T")} body={t("s3Step2B")} />
          <LifecycleStep n="3" title={t("s3Step3T")} body={t("s3Step3B")} />
          <LifecycleStep n="4" title={t("s3Step4T")} body={t("s3Step4B")} />
        </ol>
      </Section>

      {/* ── 4 · Visibility levels (interactive) ── */}
      <Section tag={t("s4Tag")}>
        <SectionHead title={t("s4H")} body={t("s4Sub")} />
        <div className="mt-8">
          <VisibilityDial s={dialStrings} />
        </div>
      </Section>

      {/* ── 5 · Use cases ── */}
      <Section tag={t("s5Tag")} surface>
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

      {/* ── 6 · Sandbox / security ── */}
      <Section tag={t("s6Tag")}>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHead title={t("s6H")} body={t("s6Body")} />
          </div>
          <ul className="grid gap-px self-start overflow-hidden rounded border border-border bg-border sm:grid-cols-2 lg:col-span-7">
            <SandboxItem icon={ShieldOff} label={t("s6Item1L")} value={t("s6Item1V")} />
            <SandboxItem icon={WifiOff} label={t("s6Item2L")} value={t("s6Item2V")} />
            <SandboxItem icon={Cookie} label={t("s6Item3L")} value={t("s6Item3V")} />
            <SandboxItem icon={Box} label={t("s6Item4L")} value={t("s6Item4V")} />
          </ul>
        </div>
      </Section>

      {/* ── 7 · The catalog ── */}
      <Section tag={t("s7Tag")} surface>
        <SectionHead title={t("s7H")} body={t("s7Body")} />
        <div className="mt-8 overflow-hidden rounded border border-border-strong">
          <div className="flex items-center justify-between border-b border-border bg-background px-4 py-2.5">
            <span className="meta">{t("panelHeader")}</span>
            <span className="meta">{t("panelCount")}</span>
          </div>
          <ul className="divide-y divide-border bg-background">
            <CatalogRow n="047" name="campaign-hero.html" type="HTML" size="2.4KB" views="142" badge={t("lvlPublic")} />
            <CatalogRow n="046" name="brief-q2.md" type="MD" size="1.1KB" views="38" badge={t("lvlTeam")} />
            <CatalogRow n="045" name="pricing-table.html" type="HTML" size="6.7KB" views="91" badge={t("lvlPublicPw")} />
            <CatalogRow n="044" name="slugify.ts" type="CODE" size="0.4KB" views="12" badge={t("lvlTeam")} />
          </ul>
        </div>
      </Section>

      {/* ── 8 · Feedback ── */}
      <Section tag={t("s8Tag")}>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHead title={t("s8H")} body={t("s8Body")} />
          </div>
          <div className="self-start overflow-hidden rounded border border-border bg-surface lg:col-span-7">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="meta">
                <Hash className="mr-1 inline size-3 text-primary" aria-hidden />
                047 · CAMPAIGN-HERO.HTML
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Heart className="size-3.5 text-primary" aria-hidden /> 9
              </span>
            </div>
            <ul className="divide-y divide-border">
              <Comment name={t("fbName1")} body={t("fbMsg1")} />
              <Comment name={t("fbName2")} body={t("fbMsg2")} />
            </ul>
          </div>
        </div>
      </Section>

      {/* ── 9 · Open-core ── */}
      <Section tag={t("s9Tag")} surface>
        <SectionHead title={t("s9H")} body={t("s9Body")} />
        <div className="mt-8 grid gap-px overflow-hidden rounded border border-border bg-border md:grid-cols-2">
          <EditionCol title={t("ossTitle")} price={t("ossPrice")} desc={t("ossDesc")} />
          <EditionCol title={t("cloudTitle")} price={t("cloudPrice")} desc={t("cloudDesc")} accent />
        </div>
        <p className="meta mt-4 flex items-center gap-2">
          <Box className="size-3.5 text-primary" strokeWidth={1.5} aria-hidden />
          {t("madeWith")} · {t("madeWithNote")}
        </p>
      </Section>

      {/* ── 10 · FAQ ── */}
      <Section tag={t("s10Tag")}>
        <SectionHead title={t("s10H")} />
        <dl className="mt-8 divide-y divide-border border-y border-border">
          <Faq q={t("faqQ1")} a={t("faqA1")} />
          <Faq q={t("faqQ2")} a={t("faqA2")} />
          <Faq q={t("faqQ3")} a={t("faqA3")} />
          <Faq q={t("faqQ4")} a={t("faqA4")} />
        </dl>
      </Section>

      {/* ── 11 · Final CTA ── */}
      <section className="border-t border-border-strong bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:py-28">
          <div className="max-w-[40rem] space-y-6">
            <h2
              className="font-display font-extrabold leading-[1.05] tracking-[-0.03em]"
              style={{ fontSize: "clamp(1.5rem, 4vw, 3rem)" }}
            >
              {t("ctaFinalH")}
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="gap-2">
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
  );
}

/* ── Section primitives ── */

function Section({
  tag,
  surface,
  children,
}: {
  tag: string;
  surface?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`border-t border-border-strong ${surface ? "bg-surface" : ""}`}
    >
      <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
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

function ChatBubble({
  name,
  children,
}: {
  name: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-sm border border-border bg-surface px-3 py-2">
      <span className="meta">{name}</span>
      <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
        {children}
      </p>
    </li>
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

function SandboxItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-start gap-3 bg-background p-5">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.5} />
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="meta mt-0.5">{value}</div>
      </div>
    </li>
  );
}

function CatalogRow({
  n,
  name,
  type,
  size,
  views,
  badge,
}: {
  n: string;
  name: string;
  type: string;
  size: string;
  views: string;
  badge: string;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="font-mono text-xs tabular-nums text-primary">#{n}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-sm">
        {name}
      </span>
      <span className="meta hidden sm:inline">
        {type} · {size} · {views} VIEWS
      </span>
      <span className="rounded-xs border border-border-strong px-1.5 py-0.5 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {badge}
      </span>
    </li>
  );
}

function Comment({ name, body }: { name: string; body: string }) {
  return (
    <li className="flex gap-3 px-4 py-3.5">
      <MessageSquare
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.5}
        aria-hidden
      />
      <div>
        <span className="meta">{name}</span>
        <p className="mt-0.5 text-sm leading-snug text-foreground">
          {body}
        </p>
      </div>
    </li>
  );
}

function EditionCol({
  title,
  price,
  desc,
  accent,
}: {
  title: string;
  price: string;
  desc: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-background p-6">
      <div className="flex items-baseline justify-between">
        <h3 className="font-mono text-sm font-semibold uppercase tracking-[0.04em]">
          {title}
        </h3>
        <span
          className={`font-mono text-sm font-semibold ${accent ? "text-primary" : "text-muted-foreground"}`}
        >
          {price}
        </span>
      </div>
      <p className="mt-3 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
        {desc}
      </p>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="grid gap-2 py-5 lg:grid-cols-12 lg:gap-8">
      <dt className="text-base font-semibold lg:col-span-5">{q}</dt>
      <dd className="max-w-[60ch] text-base leading-relaxed text-muted-foreground lg:col-span-7">
        {a}
      </dd>
    </div>
  );
}

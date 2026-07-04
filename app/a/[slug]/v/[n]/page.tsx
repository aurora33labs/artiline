import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Lock, FileX, Ban, AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { evaluateAccess } from "@/lib/visibility";
import { resolveArtifactVersion } from "@/lib/artifact-resolve";
import { getContent, rawContentPath } from "@/lib/artifact-content";
import { isReactRenderable } from "@/lib/detect-artifact";
import { recordView, extractIp } from "@/lib/tracking";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; n: string }>;
}): Promise<Metadata> {
  const { slug, n } = await params;
  const versionNumber = Number.parseInt(n, 10);
  if (!Number.isFinite(versionNumber) || versionNumber <= 0) {
    return { title: "Artiline" };
  }
  const resolved = await resolveArtifactVersion(slug, versionNumber);
  // Don't surface metadata for un-approved (pending/rejected) proposals.
  if (!resolved || resolved.version.reviewStatus !== "approved")
    return { title: "Artiline" };
  const isPublic =
    resolved.artifact.visibility === "public" ||
    resolved.artifact.visibility === "public_pw";
  return {
    title: `${resolved.version.title} (V${versionNumber}) — Artiline`,
    description: resolved.version.message ?? undefined,
    robots: isPublic ? undefined : { index: false, follow: false },
    alternates: { canonical: `/a/${slug}` },
    openGraph: {
      title: `${resolved.version.title} · V${versionNumber}`,
      description: resolved.version.message ?? undefined,
      type: "article",
      url: `/a/${slug}/v/${versionNumber}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${resolved.version.title} · V${versionNumber}`,
      description: resolved.version.message ?? undefined,
    },
  };
}
import { ArtifactViewer } from "@/components/artifact-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand-logo";
import { PublicFooter } from "@/components/public-footer";

export default async function PinnedVersionView({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; n: string }>;
  searchParams: Promise<{ pw?: string }>;
}) {
  const { slug, n } = await params;
  const { pw } = await searchParams;
  const t = await getTranslations("viewer");

  const versionNumber = Number.parseInt(n, 10);
  if (!Number.isFinite(versionNumber) || versionNumber <= 0) {
    return (
      <Gate Icon={FileX} title={t("notFoundTitle")} message={t("notFoundMsg")} />
    );
  }

  const resolved = await resolveArtifactVersion(slug, versionNumber);
  const artifact = resolved?.artifact ?? null;
  // Public deep-links only ever expose the approved history. Pending or
  // rejected proposals must never leak — even for a public artifact — so an
  // un-approved version reads as "not found" (falls into the gate below).
  // External-site artifacts are never public and have no renderable content —
  // a versioned deep link to one always reads as not-found.
  const version = (() => {
    if (!resolved) return null;
    const v = resolved.version;
    if (v.reviewStatus !== "approved") return null;
    if (v.type === "external") return null;
    return v;
  })();

  const session = await auth();
  const access = await evaluateAccess(artifact, {
    sessionUserId: session?.user?.id ?? null,
    passwordAttempt: pw ?? null,
  });

  if (access.kind === "not_found" || !version) {
    return (
      <Gate Icon={FileX} title={t("notFoundTitle")} message={t("notFoundMsg")} />
    );
  }
  if (access.kind === "expired") {
    return (
      <Gate
        Icon={AlertTriangle}
        title={t("expiredTitle")}
        message={t("expiredMsg")}
      />
    );
  }
  if (access.kind === "needs_login") {
    return (
      <Gate Icon={Lock} title={t("teamOnlyTitle")} message={t("teamOnlyMsg")}>
        <Button asChild>
          <Link href={`/login`}>{t("loginBtn")}</Link>
        </Button>
      </Gate>
    );
  }
  if (access.kind === "not_member") {
    return (
      <Gate
        Icon={Ban}
        title={t("noAccessTitle")}
        message={t("noAccessMsg")}
      />
    );
  }
  if (access.kind === "needs_password") {
    return (
      <PasswordPrompt slug={slug} n={versionNumber} hasAttempt={!!pw} />
    );
  }

  const reqHeaders = await headers();
  await recordView({
    artifactId: artifact!.id,
    versionId: version.id,
    workspaceId: artifact!.workspaceId,
    ip: extractIp(reqHeaders),
    userAgent: reqHeaders.get("user-agent"),
    referrer: reqHeaders.get("referer"),
    userId: session?.user?.id ?? null,
  }).catch(() => {
    /* tracking failures should never block render */
  });

  const isHtml = version.type === "html";
  const usesIframe =
    isHtml || isReactRenderable(version.type, version.language);
  const content = isHtml ? null : await getContent(version);

  return (
    <main className="fixed inset-0 bg-background overflow-auto">
      <link rel="canonical" href={`/a/${artifact!.slug}`} />
      <ArtifactViewer
        artifact={{
          // Guaranteed non-"external" by the `version` guard above.
          type: version.type as "html" | "markdown" | "code",
          language: version.language,
          contentSrc: usesIframe ? rawContentPath({ slug, versionNumber, pw }) : null,
          content,
        }}
        fullscreen
      />
      <PublicFooter />
    </main>
  );
}

async function Gate({
  Icon,
  title,
  message,
  children,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  const t = await getTranslations("viewer");
  return (
    <main className="flex-1 min-h-screen flex flex-col">
      <header className="px-6 py-5 border-b border-border">
        <BrandLogo size="md" />
      </header>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="size-12 rounded-sm border border-border-strong bg-surface-2 flex items-center justify-center">
            <Icon className="size-5 text-primary" />
          </div>
          <div className="space-y-2">
            <div className="meta">{t("accessDenied")}</div>
            <h1 className="text-2xl">{title}</h1>
            <p className="text-muted-foreground text-sm">{message}</p>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}

async function PasswordPrompt({
  slug,
  n,
  hasAttempt,
}: {
  slug: string;
  n: number;
  hasAttempt: boolean;
}) {
  const t = await getTranslations("viewer");
  const tc = await getTranslations("common");
  return (
    <main className="flex-1 min-h-screen flex flex-col">
      <header className="px-6 py-5 border-b border-border">
        <BrandLogo size="md" />
      </header>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-3">
            <div className="size-12 rounded-sm border border-border-strong bg-surface-2 flex items-center justify-center">
              <Lock className="size-5 text-primary" />
            </div>
            <div className="meta">{t("passwordRequiredMeta")}</div>
            <h1 className="text-2xl">{t("passwordRequiredTitle")}</h1>
            <p className="text-muted-foreground text-sm">{t("passwordAsk")}</p>
          </div>
          <form
            action={`/a/${slug}/v/${n}`}
            method="get"
            className="space-y-3 border border-border bg-surface p-6"
          >
            <div className="space-y-1.5">
              <Label htmlFor="pw">{tc("password")}</Label>
              <Input
                id="pw"
                name="pw"
                type="password"
                required
                autoFocus
                className="h-11"
              />
            </div>
            {hasAttempt && (
              <p className="meta text-destructive">{t("passwordWrong")}</p>
            )}
            <Button type="submit" className="w-full h-11">
              {t("enter")}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}

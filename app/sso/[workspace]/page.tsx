import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isFeatureEnabled } from "@/lib/license";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";

export default async function SsoStartPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { workspace } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("sso");

  const KNOWN_ERRORS = ["disabled", "invalid", "assertion", "domain"] as const;
  const errorKey =
    error && (KNOWN_ERRORS as readonly string[]).includes(error)
      ? error
      : error
        ? "generic"
        : null;

  const { resolveWorkspaceSso } = await import("@/lib/cloud/sso");
  const sso = await resolveWorkspaceSso(workspace);
  if (!sso || !sso.enabled) notFound();
  if (!(await isFeatureEnabled("sso_saml", { workspaceId: sso.workspace.id }))) {
    notFound();
  }

  return (
    <AuthShell
      title={t("startTitle", { workspace: sso.workspace.name })}
      subtitle={t("startSubtitle")}
    >
      {errorKey && (
        <div className="border border-destructive/40 bg-destructive/5 text-destructive text-sm p-3">
          {t(`error.${errorKey}`)}
        </div>
      )}
      <Button asChild className="w-full h-11">
        <a href={`/api/sso/${workspace}/login`}>{t("continue")}</a>
      </Button>
    </AuthShell>
  );
}

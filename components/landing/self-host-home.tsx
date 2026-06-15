import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth-shell";
import { isFirstRun } from "@/lib/bootstrap";

/**
 * Minimal entry screen for self-hosted instances (landingMode === "app"). No
 * marketing copy. On a brand-new instance (no users yet) it shows first-run
 * owner setup; otherwise a plain sign-in / create-workspace menu.
 */
export async function SelfHostHome() {
  const firstRun = await isFirstRun();
  const t = await getTranslations("selfHost");

  if (firstRun) {
    return (
      <AuthShell title={t("firstRunTitle")} subtitle={t("firstRunSubtitle")}>
        <Button asChild className="h-11 w-full">
          <Link href="/signup">
            {t("firstRunCta")}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground">{t("firstRunNote")}</p>
      </AuthShell>
    );
  }

  // After first-run, signup is closed (invite-only) — only offer sign in.
  return (
    <AuthShell
      title={t("menuTitle")}
      subtitle={t("menuInviteOnlySubtitle")}
    >
      <Button asChild className="h-11 w-full">
        <Link href="/login">
          {t("signIn")}
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </AuthShell>
  );
}

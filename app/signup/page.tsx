import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";
import { isFirstRun } from "@/lib/bootstrap";
import { currentEdition } from "@/lib/license";
import { signUpWithPassword } from "./actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");

  // OSS: after the first-run owner exists, signup is closed — invite only.
  if (currentEdition() === "oss" && !(await isFirstRun())) {
    return (
      <AuthShell title={t("signupClosedTitle")} subtitle={t("signupClosedSubtitle")}>
        <Button asChild className="w-full h-11">
          <Link href="/login">{tc("signIn")}</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("signupTitle")}
      subtitle={t("signupSubtitle")}
      footer={
        <>
          {t("alreadyHave")}{" "}
          <Link
            href="/login"
            className="text-foreground font-medium hover:text-primary"
          >
            {tc("signIn")}
          </Link>
        </>
      }
    >
      <form action={signUpWithPassword} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t("nameLabel")}</Label>
          <Input
            id="name"
            name="name"
            type="text"
            required
            placeholder={t("namePlaceholder")}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t("workEmailLabel")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder={t("workEmailPlaceholder")}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("setPasswordLabel")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder={t("passwordHint")}
            className="h-11"
          />
        </div>
        {error === "invalid" && (
          <p className="text-sm text-destructive">{t("signupInvalid")}</p>
        )}
        <Button type="submit" className="w-full h-11">
          {t("createAccountBtn")}
        </Button>
      </form>
    </AuthShell>
  );
}

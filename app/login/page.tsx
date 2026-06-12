import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";
import { signInWithPassword } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");
  // Magic link only works when an email provider is configured. On self-host
  // without Resend, hide it so password stays the single working path.
  const resendEnabled = !!process.env.RESEND_API_KEY;
  return (
    <AuthShell
      title={t("loginTitle")}
      subtitle={t("loginSubtitle")}
      footer={
        <>
          {t("firstTime")}{" "}
          <Link
            href="/signup"
            className="text-foreground font-medium hover:text-primary"
          >
            {t("createWorkspaceLink")}
          </Link>
        </>
      }
    >
      <form action={signInWithPassword} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{tc("email")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("passwordLabel")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder={t("passwordPlaceholder")}
            className="h-11"
          />
        </div>
        {error === "badcreds" && (
          <p className="text-sm text-destructive">{t("badCredentials")}</p>
        )}
        {error === "needsignin" && (
          <p className="text-sm text-muted-foreground">{t("needSignin")}</p>
        )}
        {error === "exists" && (
          <p className="text-sm text-muted-foreground">{t("alreadyExists")}</p>
        )}
        {error === "closed" && (
          <p className="text-sm text-muted-foreground">{t("signupClosedHint")}</p>
        )}
        <Button type="submit" className="w-full h-11">
          {tc("signIn")}
        </Button>
      </form>

      {resendEnabled && (
        <>
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="meta">{t("orDivider")}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form
            action={async (formData) => {
              "use server";
              await signIn("resend", {
                email: formData.get("email"),
                redirectTo: "/",
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="magic-email">{tc("email")}</Label>
              <Input
                id="magic-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                className="h-11"
              />
            </div>
            <Button type="submit" variant="outline" className="w-full h-11">
              {t("sendMagicLink")}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";

export default async function LoginPage() {
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");
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
        <Button type="submit" className="w-full h-11">
          {t("sendMagicLink")}
        </Button>
      </form>
    </AuthShell>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";

export default async function SignupPage() {
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");
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
      <form
        action={async (formData) => {
          "use server";
          await signIn("resend", {
            email: formData.get("email"),
            redirectTo: "/signup/workspace",
          });
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="email">{t("workEmailLabel")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder={t("workEmailPlaceholder")}
            className="h-11"
          />
        </div>
        <Button type="submit" className="w-full h-11">
          {t("continueLink")}
        </Button>
      </form>
    </AuthShell>
  );
}

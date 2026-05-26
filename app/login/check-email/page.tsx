import { Mail } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth-shell";

export default async function CheckEmail() {
  const t = await getTranslations("auth");
  return (
    <AuthShell title={t("checkEmailTitle")} subtitle={t("checkEmailSubtitle")}>
      <div className="border border-border bg-surface p-5 flex items-start gap-4">
        <div className="size-10 rounded-sm border border-border-strong bg-surface-2 flex items-center justify-center shrink-0">
          <Mail className="size-5 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="font-medium text-sm">{t("linkSent")}</p>
          <p className="text-sm text-muted-foreground">{t("linkInfo")}</p>
        </div>
      </div>
      <p className="meta">{t("devMode")}</p>
    </AuthShell>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export async function EmptyDashboard({ workspaceSlug }: { workspaceSlug: string }) {
  const t = await getTranslations("dashboard");
  return (
    <div className="border border-dashed border-border-strong rounded-md min-h-[60vh] flex items-center justify-center px-6 py-16">
      <div className="max-w-lg space-y-8">
        <div className="meta">{t("emptyTitle")}</div>
        <h2 className="text-2xl">
          {t("emptyHeadingLine1")}
          <br />
          {t("emptyHeadingLine2")}
        </h2>
        <p className="text-muted-foreground text-base leading-relaxed">
          {t("emptyBody")}
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button asChild>
            <Link href={`/${workspaceSlug}/new`}>{t("createFirst")}</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href={`/${workspaceSlug}/settings`}>{t("inviteTeam")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

import { requireMemberPage } from "@/lib/tenant";
import { getTranslations } from "next-intl/server";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createExternalSite } from "./actions";

export default async function NewExternalSitePage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  await requireMemberPage(slug);
  const t = await getTranslations("externalReview");

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>
      <form action={createExternalSite} className="space-y-4">
        <input type="hidden" name="workspaceSlug" value={slug} />
        <div className="space-y-2">
          <Label htmlFor="ext-name">{t("nameLabel")}</Label>
          <Input id="ext-name" name="name" required maxLength={200} placeholder={t("namePlaceholder")} className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ext-url">{t("urlLabel")}</Label>
          <Input id="ext-url" name="url" type="url" required placeholder={t("urlPlaceholder")} className="h-11" />
        </div>
        <Button type="submit">{t("create")}</Button>
      </form>
    </div>
  );
}

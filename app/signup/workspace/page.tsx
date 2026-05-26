import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { db, schema } from "@/lib/db";
import { getMyWorkspaces, slugify } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";
import { eq } from "drizzle-orm";

export default async function CreateWorkspace() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const workspaces = await getMyWorkspaces(session.user.id);
  if (workspaces.length > 0) redirect(`/${workspaces[0].slug}`);

  const t = await getTranslations("auth");

  return (
    <AuthShell title={t("workspaceTitle")} subtitle={t("workspaceSubtitle")}>
      <form
        action={async (formData) => {
          "use server";
          const s = await auth();
          if (!s?.user?.id) throw new Error("UNAUTH");
          const rawName = String(formData.get("name") ?? "").trim();
          if (!rawName) throw new Error("ERR_NAME_REQUIRED");
          let slug = slugify(rawName) || "team";
          let suffix = 0;
          while (true) {
            const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
            const [exists] = await db
              .select({ id: schema.workspaces.id })
              .from(schema.workspaces)
              .where(eq(schema.workspaces.slug, candidate))
              .limit(1);
            if (!exists) {
              slug = candidate;
              break;
            }
            suffix++;
          }
          const [ws] = await db
            .insert(schema.workspaces)
            .values({ slug, name: rawName, ownerUserId: s.user.id })
            .returning();
          await db.insert(schema.workspaceMembers).values({
            workspaceId: ws.id,
            userId: s.user.id,
            role: "owner",
          });
          redirect(`/${ws.slug}`);
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="name">{t("workspaceLabel")}</Label>
          <Input
            id="name"
            name="name"
            required
            placeholder={t("workspacePlaceholder")}
            className="h-11"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">{t("inviteAfter")}</p>
        </div>
        <Button type="submit" className="w-full h-11">
          {t("createWorkspaceBtn")}
        </Button>
      </form>
    </AuthShell>
  );
}

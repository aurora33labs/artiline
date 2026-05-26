import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("invite");
  const tc = await getTranslations("common");

  const [invitation] = await db
    .select({
      id: schema.invitations.id,
      email: schema.invitations.email,
      role: schema.invitations.role,
      acceptedAt: schema.invitations.acceptedAt,
      expiresAt: schema.invitations.expiresAt,
      workspaceId: schema.workspaces.id,
      workspaceSlug: schema.workspaces.slug,
      workspaceName: schema.workspaces.name,
    })
    .from(schema.invitations)
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.id, schema.invitations.workspaceId),
    )
    .where(eq(schema.invitations.token, token))
    .limit(1);

  if (!invitation)
    return (
      <AuthShell title={t("invalidTitle")} subtitle={t("invalidSubtitle")}>
        <></>
      </AuthShell>
    );

  if (invitation.acceptedAt) {
    redirect(`/${invitation.workspaceSlug}`);
  }

  if (invitation.expiresAt < new Date())
    return (
      <AuthShell title={t("expiredTitle")} subtitle={t("expiredSubtitle")}>
        <></>
      </AuthShell>
    );

  const session = await auth();

  if (!session?.user?.id) {
    return (
      <AuthShell
        title={t("joinTitle", { workspace: invitation.workspaceName })}
        subtitle={t("joinSubtitle")}
      >
        <form
          action={async (formData) => {
            "use server";
            await signIn("resend", {
              email: formData.get("email") || invitation.email,
              redirectTo: `/invite/${token}`,
            });
          }}
          className="space-y-3"
        >
          <div className="space-y-2">
            <Label htmlFor="email">{tc("email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={invitation.email}
              readOnly
              className="h-11 bg-muted"
            />
          </div>
          <Button type="submit" className="w-full h-11">
            {t("magicLinkBtn")}
          </Button>
        </form>
      </AuthShell>
    );
  }

  if (session.user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <AuthShell
        title={t("mismatchTitle")}
        subtitle={t("mismatchSubtitle", { email: invitation.email })}
      >
        <p className="text-sm text-muted-foreground">
          {t.rich("loggedAs", {
            email: session.user.email ?? "",
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </AuthShell>
    );
  }

  await db
    .insert(schema.workspaceMembers)
    .values({
      workspaceId: invitation.workspaceId,
      userId: session.user.id,
      role: invitation.role,
    })
    .onConflictDoNothing();

  await db
    .update(schema.invitations)
    .set({ acceptedAt: new Date() })
    .where(eq(schema.invitations.id, invitation.id));

  redirect(`/${invitation.workspaceSlug}`);
}

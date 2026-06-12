import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";
import { acceptInvite } from "./actions";

export default async function AcceptInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
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
    const [existingUser] = await db
      .select({ passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.email, invitation.email))
      .limit(1);
    const hasPassword = !!existingUser?.passwordHash;

    // Account exists but has no password (magic link / SSO). The invite link
    // can't bind credentials to it — they must sign in their own way first, then
    // revisit this link (the logged-in branch below auto-accepts). Don't show a
    // set-password form the action will refuse.
    if (existingUser && !hasPassword) {
      return (
        <AuthShell
          title={t("needSignInTitle")}
          subtitle={t("needSignInSubtitle", { email: invitation.email })}
        >
          <Button asChild className="w-full h-11">
            <Link href="/login">{tc("signIn")}</Link>
          </Button>
        </AuthShell>
      );
    }

    return (
      <AuthShell
        title={t("joinTitle", { workspace: invitation.workspaceName })}
        subtitle={hasPassword ? t("joinReturningSubtitle") : t("joinSubtitle")}
      >
        <form action={acceptInvite} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-2">
            <Label htmlFor="email">{tc("email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={invitation.email}
              readOnly
              disabled
              className="h-11 bg-muted"
            />
          </div>
          {!hasPassword && (
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
          )}
          {hasPassword && <input type="hidden" name="name" value={invitation.email} />}
          <div className="space-y-2">
            <Label htmlFor="password">
              {hasPassword ? t("passwordLabel") : t("setPasswordLabel")}
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={hasPassword ? "current-password" : "new-password"}
              placeholder={t("passwordPlaceholder")}
              className="h-11"
            />
          </div>
          {error === "badpw" && (
            <p className="text-sm text-destructive">{t("badPassword")}</p>
          )}
          <Button type="submit" className="w-full h-11">
            {hasPassword ? t("joinBtn") : t("createAccountBtn")}
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

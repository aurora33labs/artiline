import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";
import { emailDomainAllowed } from "@/lib/join-requests";
import { requestToJoin } from "./actions";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("join");
  const tc = await getTranslations("common");

  const [workspace] = await db
    .select({
      id: schema.workspaces.id,
      slug: schema.workspaces.slug,
      name: schema.workspaces.name,
      joinRequestsEnabled: schema.workspaces.joinRequestsEnabled,
      allowedEmailDomains: schema.workspaces.allowedEmailDomains,
    })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, slug))
    .limit(1);

  if (!workspace || !workspace.joinRequestsEnabled)
    return (
      <AuthShell title={t("closedTitle")} subtitle={t("closedSubtitle")}>
        <></>
      </AuthShell>
    );

  const session = await auth();

  // --- Logged out: create account (or sign in) + request in one step ---------
  if (!session?.user?.id) {
    return (
      <AuthShell
        title={t("joinTitle", { workspace: workspace.name })}
        subtitle={t("joinSubtitle")}
      >
        <form action={requestToJoin} className="space-y-3">
          <input type="hidden" name="slug" value={workspace.slug} />
          <div className="space-y-2">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder={t("emailPlaceholder")}
              className="h-11"
            />
          </div>
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
            <Label htmlFor="password">{t("setPasswordLabel")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={t("passwordPlaceholder")}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              {t("joinReturningSubtitle")}
            </p>
          </div>
          {error === "domain" && (
            <p className="text-sm text-destructive">
              {t("domainBlockedSubtitle", { workspace: workspace.name })}
            </p>
          )}
          {error === "badpw" && (
            <p className="text-sm text-destructive">{t("badPassword")}</p>
          )}
          {error === "throttled" && (
            <p className="text-sm text-destructive">{t("throttled")}</p>
          )}
          <Button type="submit" className="w-full h-11">
            {t("createAccountBtn")}
          </Button>
        </form>
      </AuthShell>
    );
  }

  const email = (session.user.email ?? "").toLowerCase();

  // Already a member → straight to the workspace.
  const [member] = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspace.id),
        eq(schema.workspaceMembers.userId, session.user.id),
      ),
    )
    .limit(1);
  if (member) redirect(`/${workspace.slug}`);

  // Pending request → show the pending state.
  const [existingReq] = await db
    .select({ status: schema.joinRequests.status })
    .from(schema.joinRequests)
    .where(
      and(
        eq(schema.joinRequests.workspaceId, workspace.id),
        eq(schema.joinRequests.userId, session.user.id),
      ),
    )
    .limit(1);
  if (existingReq?.status === "pending")
    return (
      <AuthShell
        title={t("pendingTitle")}
        subtitle={t("pendingSubtitle", { workspace: workspace.name })}
      >
        <Button asChild variant="outline" className="w-full h-11">
          <Link href="/">{tc("back")}</Link>
        </Button>
      </AuthShell>
    );

  // Domain not allowed → blocked message.
  if (!emailDomainAllowed(email, workspace.allowedEmailDomains))
    return (
      <AuthShell
        title={t("domainBlockedTitle")}
        subtitle={t("domainBlockedSubtitle", { workspace: workspace.name })}
      >
        <></>
      </AuthShell>
    );

  // Logged in, allowed, no pending request → one-click request.
  return (
    <AuthShell
      title={t("requestLoggedInTitle", { workspace: workspace.name })}
      subtitle={t("requestLoggedInSubtitle", { email })}
    >
      <form action={requestToJoin}>
        <input type="hidden" name="slug" value={workspace.slug} />
        <Button type="submit" className="w-full h-11">
          {t("requestBtn")}
        </Button>
      </form>
    </AuthShell>
  );
}

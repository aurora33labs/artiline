import { and, eq, isNull } from "drizzle-orm";
import { Mail, ShieldCheck, Star, UserPlus, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { planLimitsForWorkspace } from "@/lib/limits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CopyLinkButton } from "@/components/copy-link-button";
import {
  inviteMember,
  revokeInvitation,
  removeMember,
} from "./actions";

function initials(src: string): string {
  const parts = src.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? "?").toUpperCase();
  return ((parts[0][0] ?? "") + (parts[1][0] ?? "")).toUpperCase();
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace, role: myRole } = await requireMemberPage(slug);
  const canManage = myRole === "owner" || myRole === "admin";
  const t = await getTranslations("settings");
  const tc = await getTranslations("common");

  const ROLE_META: Record<
    string,
    { label: string; tone: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    owner: {
      label: t("roles.owner"),
      tone: "border-primary/40 text-primary",
      Icon: Star,
    },
    admin: {
      label: t("roles.admin"),
      tone: "border-border-strong text-foreground",
      Icon: ShieldCheck,
    },
    member: {
      label: t("roles.member"),
      tone: "border-border text-muted-foreground",
      Icon: Users,
    },
  };

  const members = await db
    .select({
      userId: schema.workspaceMembers.userId,
      role: schema.workspaceMembers.role,
      email: schema.users.email,
      name: schema.users.name,
      image: schema.users.image,
    })
    .from(schema.workspaceMembers)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.workspaceMembers.userId),
    )
    .where(eq(schema.workspaceMembers.workspaceId, workspace.id));

  const pendingInvites = await db
    .select()
    .from(schema.invitations)
    .where(
      and(
        eq(schema.invitations.workspaceId, workspace.id),
        isNull(schema.invitations.acceptedAt),
      ),
    );

  const seatLimit = (await planLimitsForWorkspace(workspace.id)).members;
  const seatsUsed = members.length + pendingInvites.length;
  const atSeatCap = seatLimit >= 0 && seatsUsed >= seatLimit;

  return (
    <div className="space-y-10 max-w-4xl">
      <header className="space-y-2">
        <div className="meta">
          {t("teamHeader", { name: workspace.name.toUpperCase() })}
        </div>
        <h1 className="text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </header>

      {canManage && (
        <section className="border border-border bg-surface p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-sm border border-border-strong bg-surface-2 flex items-center justify-center">
              <UserPlus className="size-4 text-primary" />
            </div>
            <div className="space-y-0.5">
              <h2 className="text-sm font-sans font-semibold normal-case tracking-normal">
                {t("inviteTitle")}
              </h2>
              <p className="meta">
                {t("inviteSubtitle")}
                {seatLimit >= 0 && ` · ${seatsUsed}/${seatLimit}`}
              </p>
            </div>
          </div>
          {atSeatCap ? (
            <div className="meta text-warning border border-warning px-3 py-2">
              {t("seatCap", { limit: seatLimit })}
            </div>
          ) : (
          <form
            action={inviteMember}
            className="flex flex-col sm:flex-row gap-2 sm:items-end"
          >
            <input type="hidden" name="workspaceSlug" value={slug} />
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="email">{tc("email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder={t("emailPlaceholder")}
                className="h-10"
              />
            </div>
            <div className="w-full sm:w-36 space-y-1.5">
              <Label>{t("roleLabel")}</Label>
              <Select name="role" defaultValue="member">
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">{t("memberRole")}</SelectItem>
                  <SelectItem value="admin">{t("adminRole")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="h-10">
              {t("inviteBtn")}
            </Button>
          </form>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="meta">
            {t("membersLabel", { count: String(members.length).padStart(2, "0") })}
          </div>
        </div>

        <div className="border border-border bg-surface divide-y divide-border">
          {members.map((m) => {
            const display = m.name ?? m.email;
            const roleMeta = ROLE_META[m.role] ?? ROLE_META.member;
            const isOwner = m.userId === workspace.ownerUserId;
            return (
              <div
                key={m.userId}
                className="px-4 py-3 flex items-center gap-3"
              >
                <div className="relative shrink-0">
                  {m.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={m.image}
                      alt={display}
                      className="size-9 rounded-sm object-cover border border-border"
                    />
                  ) : (
                    <div className="size-9 rounded-sm border border-border-strong bg-surface-2 text-foreground font-display text-xs font-bold flex items-center justify-center">
                      {initials(display)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{display}</div>
                  <div className="meta truncate">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-display font-medium uppercase tracking-[0.06em] border rounded-xs",
                      roleMeta.tone,
                    )}
                    title={roleMeta.label}
                  >
                    <roleMeta.Icon className="size-3" />
                    {roleMeta.label}
                  </span>
                  {canManage && !isOwner && (
                    <form action={removeMember}>
                      <input
                        type="hidden"
                        name="workspaceSlug"
                        value={slug}
                      />
                      <input type="hidden" name="userId" value={m.userId} />
                      <Button
                        variant="ghost"
                        size="sm"
                        type="submit"
                        className="text-muted-foreground hover:text-destructive"
                        title={t("removeBtn")}
                      >
                        ×
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {pendingInvites.length > 0 && (
        <section className="space-y-3">
          <div className="meta">
            {t("pendingLabel", {
              count: String(pendingInvites.length).padStart(2, "0"),
            })}
          </div>
          <ul className="border border-border bg-surface divide-y divide-border">
            {pendingInvites.map((i) => (
              <li
                key={i.id}
                className="px-4 py-3 flex items-center gap-3"
              >
                <div className="size-9 rounded-sm border border-border bg-surface-2 flex items-center justify-center">
                  <Mail className="size-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{i.email}</div>
                  <div className="meta">
                    {t("pendingBadge", { role: i.role.toUpperCase() })}
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <CopyLinkButton path={`/invite/${i.token}`} />
                    <form action={revokeInvitation}>
                      <input
                        type="hidden"
                        name="workspaceSlug"
                        value={slug}
                      />
                      <input type="hidden" name="invitationId" value={i.id} />
                      <Button variant="ghost" size="sm" type="submit">
                        {t("revokeBtn")}
                      </Button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

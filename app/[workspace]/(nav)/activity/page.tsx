import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getFormatter } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { listWorkspaceMembers } from "@/lib/members";
import { Button } from "@/components/ui/button";

const TYPE_LABEL: Record<string, string> = {
  "artifact.created": "ARTIFACT CREATED",
  "version.published": "VERSION PUBLISHED",
  "version.approved": "VERSION APPROVED",
  "version.changes_requested": "CHANGES REQUESTED",
  "version.rolled_back": "ROLLBACK",
  "visibility.changed": "VISIBILITY CHANGED",
  "member.invited": "MEMBER INVITED",
  "member.joined": "MEMBER JOINED",
  "member.removed": "MEMBER REMOVED",
  "invitation.revoked": "INVITE REVOKED",
  "comment.created": "COMMENT",
};

const TYPE_COLOR: Record<string, string> = {
  "artifact.created": "text-primary",
  "version.published": "text-warning",
  "version.approved": "text-success",
  "version.changes_requested": "text-destructive",
  "version.rolled_back": "text-warning",
  "visibility.changed": "text-muted-foreground",
};

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{
    type?: string;
    actor?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { workspace: slug } = await params;
  const { type, actor, from, to } = await searchParams;
  const { workspace } = await requireMemberPage(slug);
  const fmt = await getFormatter();
  const members = await listWorkspaceMembers(workspace.id);

  const conditions = [eq(schema.events.workspaceId, workspace.id)];
  if (type && type in TYPE_LABEL) conditions.push(eq(schema.events.type, type));
  if (actor) conditions.push(eq(schema.events.actorUserId, actor));
  if (from) conditions.push(gte(schema.events.createdAt, new Date(`${from}T00:00:00.000Z`)));
  if (to) conditions.push(lte(schema.events.createdAt, new Date(`${to}T23:59:59.999Z`)));

  const rows = await db
    .select({
      event: schema.events,
      actor: {
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
      },
    })
    .from(schema.events)
    .leftJoin(schema.users, eq(schema.users.id, schema.events.actorUserId))
    .where(and(...conditions))
    .orderBy(desc(schema.events.createdAt))
    .limit(200);

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="meta">WORKSPACE · {workspace.name.toUpperCase()}</div>
        <h1 className="text-3xl">Activity</h1>
        <p className="text-muted-foreground text-sm">
          Últimos 200 eventos del workspace.
        </p>
      </header>

      <form method="get" className="flex flex-wrap gap-2">
        <select
          name="type"
          defaultValue={type ?? ""}
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
        >
          <option value="">Tipo: todos</option>
          {Object.keys(TYPE_LABEL).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select
          name="actor"
          defaultValue={actor ?? ""}
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
        >
          <option value="">Actor: todos</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.email}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={from ?? ""}
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
        />
        <input
          type="date"
          name="to"
          defaultValue={to ?? ""}
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
        />
        <Button type="submit" size="sm" variant="outline">
          Filtrar
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Sin actividad aún.</p>
      ) : (
        <ol className="border border-border bg-surface divide-y divide-border">
          {rows.map(({ event, actor }) => {
            const payload = (event.payload ?? {}) as Record<string, unknown>;
            const displayTitle =
              (payload.title as string | undefined) ??
              (payload.slug as string | undefined) ??
              event.subjectId ??
              "—";
            return (
              <li
                key={event.id}
                className="px-6 py-3 flex flex-wrap items-center gap-3"
              >
                <span
                  className={`meta border px-2 py-0.5 ${TYPE_COLOR[event.type] ?? "text-muted-foreground"} border-current`}
                >
                  {TYPE_LABEL[event.type] ?? event.type.toUpperCase()}
                </span>
                <span className="text-sm font-sans font-medium normal-case tracking-normal min-w-0 truncate">
                  {displayTitle}
                </span>
                <span className="meta ml-auto">
                  {(actor?.name ?? actor?.email ?? "SYSTEM").toUpperCase()} ·{" "}
                  {fmt
                    .dateTime(event.createdAt, {
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                    .toUpperCase()}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

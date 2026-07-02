import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { requireMemberPage } from "@/lib/tenant";
import { listNotifications } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { markAllRead } from "./actions";

const TYPE_KEY: Record<string, string> = {
  "version.proposed": "proposed",
  "version.approved": "approved",
  "version.changes_requested": "changesRequested",
};

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { session, workspace } = await requireMemberPage(slug);
  const t = await getTranslations("notifications");
  const fmt = await getFormatter();

  const items = await listNotifications(session.user.id, workspace.id, 100);
  const hasUnread = items.some((i) => i.readAt == null);

  async function markAll() {
    "use server";
    await markAllRead(slug);
  }

  function message(item: (typeof items)[number]): string {
    const key = TYPE_KEY[item.type] ?? "proposed";
    return t(`type.${key}`, {
      actor: item.actorName ?? t("someone"),
      title: item.artifactTitle ?? item.artifactSlug ?? "",
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-center justify-between border-b border-border pb-6">
        <div className="space-y-2">
          <div className="meta">{t("eyebrow")}</div>
          <h1 className="text-3xl">{t("title")}</h1>
        </div>
        {hasUnread && (
          <form action={markAll}>
            <Button type="submit" variant="outline" size="sm">
              {t("markAllRead")}
            </Button>
          </form>
        )}
      </header>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="border border-border bg-surface divide-y divide-border">
          {items.map((item) => {
            const href = item.artifactSlug
              ? `/${slug}/a/${item.artifactSlug}/versions`
              : `/${slug}/notifications`;
            return (
              <li key={item.id}>
                <Link
                  href={href}
                  className="flex items-start gap-3 px-6 py-4 hover:bg-surface-2 transition-colors"
                >
                  <span
                    className={`mt-1.5 size-2 rounded-full shrink-0 ${item.readAt ? "bg-transparent" : "bg-primary"}`}
                  />
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="text-sm leading-snug">{message(item)}</div>
                    <div className="meta">
                      {fmt.relativeTime(item.createdAt)}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

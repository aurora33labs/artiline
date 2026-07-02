"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fetchNotifications,
  markAllRead,
} from "@/app/[workspace]/(nav)/notifications/actions";
import type { NotificationItem } from "@/lib/notifications";

const TYPE_KEY: Record<string, string> = {
  "version.proposed": "proposed",
  "version.approved": "approved",
  "version.changes_requested": "changesRequested",
};

const POLL_MS = 60_000;

export function NotificationBell({
  workspaceSlug,
  initialUnread,
  initialItems,
}: {
  workspaceSlug: string;
  initialUnread: number;
  initialItems: NotificationItem[];
}) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationItem[]>(initialItems);
  const [open, setOpen] = useState(false);

  async function refresh() {
    try {
      const res = await fetchNotifications(workspaceSlug);
      setUnread(res.unread);
      setItems(res.items);
    } catch {
      /* transient — keep last state */
    }
  }

  // Poll on an interval (no realtime transport) and refresh when opened.
  useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) void refresh();
  }

  async function onMarkAll() {
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date() })));
    try {
      await markAllRead(workspaceSlug);
    } catch {
      /* will reconcile on next poll */
    }
  }

  function message(item: NotificationItem): string {
    const key = TYPE_KEY[item.type] ?? "proposed";
    return t(`type.${key}`, {
      actor: item.actorName ?? t("someone"),
      title: item.artifactTitle ?? item.artifactSlug ?? "",
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("bellLabel")}
          className="relative rounded-sm p-2 text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus:outline-none"
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("title")}</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={onMarkAll}
              className="meta text-primary hover:underline"
            >
              {t("markAllRead")}
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          items.map((item) => {
            const href = item.artifactSlug
              ? `/${workspaceSlug}/a/${item.artifactSlug}/versions`
              : `/${workspaceSlug}/notifications`;
            return (
              <DropdownMenuItem key={item.id} asChild className="cursor-pointer">
                <Link href={href} className="flex flex-col items-start gap-0.5">
                  <span className="text-sm leading-snug">
                    {!item.readAt && (
                      <span className="inline-block size-1.5 rounded-full bg-primary mr-1.5 align-middle" />
                    )}
                    {message(item)}
                  </span>
                  <span className="meta">
                    {format.relativeTime(item.createdAt)}
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer justify-center">
          <Link href={`/${workspaceSlug}/notifications`}>{t("viewAll")}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

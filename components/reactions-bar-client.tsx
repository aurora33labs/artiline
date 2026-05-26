"use client";

import { useTransition, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { toggleReaction } from "@/app/actions/social";
import { cn } from "@/lib/utils";

export function ReactionsBarClient({
  artifactId,
  emojis,
  counts,
  mine,
  canReact,
  password,
  workspaceSlug,
  slug,
}: {
  artifactId: string;
  emojis: string[];
  counts: Record<string, number>;
  mine: string[];
  canReact: boolean;
  password?: string;
  workspaceSlug?: string;
  slug?: string;
}) {
  const [pending, start] = useTransition();
  const [mineSet, setMineSet] = useState(new Set(mine));
  const [localCounts, setLocalCounts] = useState(counts);
  const t = useTranslations("reactions");
  const tt = useTranslations("toasts");
  const te = useTranslations("errors");

  function translateError(code: string): string {
    try {
      return te(code);
    } catch {
      return tt("generic");
    }
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {emojis.map((emoji) => {
        const active = mineSet.has(emoji);
        const count = localCounts[emoji] ?? 0;
        return (
          <button
            type="button"
            key={emoji}
            disabled={!canReact || pending}
            onClick={() => {
              if (!canReact) {
                toast.error(t("signInToReact"));
                return;
              }
              const next = new Set(mineSet);
              const nextCounts = { ...localCounts };
              if (active) {
                next.delete(emoji);
                nextCounts[emoji] = Math.max(0, (nextCounts[emoji] ?? 0) - 1);
              } else {
                next.add(emoji);
                nextCounts[emoji] = (nextCounts[emoji] ?? 0) + 1;
              }
              setMineSet(next);
              setLocalCounts(nextCounts);
              start(async () => {
                try {
                  await toggleReaction({
                    artifactId,
                    emoji,
                    password,
                    workspaceSlug,
                    slug,
                  });
                } catch (e) {
                  const code = (e as Error).message;
                  if (code?.startsWith("NEXT_")) throw e;
                  toast.error(translateError(code));
                }
              });
            }}
            className={cn(
              "px-3 py-1 text-sm rounded-full border transition",
              active
                ? "bg-foreground text-background border-foreground"
                : "hover:bg-muted",
              !canReact && "opacity-50 cursor-not-allowed",
            )}
          >
            <span className="mr-1">{emoji}</span>
            <span className="text-xs">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

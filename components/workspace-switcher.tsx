"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type WorkspaceOption = {
  slug: string;
  name: string;
};

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: WorkspaceOption;
  workspaces: WorkspaceOption[];
}) {
  const t = useTranslations("workspaceSwitcher");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 rounded-sm px-2 py-1",
            "font-display font-medium text-xs uppercase tracking-[0.06em] hover:bg-surface-2 transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span className="size-4 rounded-xs bg-foreground text-background text-[9px] font-bold inline-flex items-center justify-center">
            {current.name[0]?.toUpperCase() ?? "W"}
          </span>
          <span className="truncate max-w-[180px]">{current.name}</span>
          <ChevronsUpDown className="size-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="meta">{t("label")}</DropdownMenuLabel>
        {workspaces.map((ws) => (
          <DropdownMenuItem key={ws.slug} asChild>
            <Link
              href={`/${ws.slug}`}
              className="flex items-center gap-2 cursor-pointer"
            >
              <span className="size-4 rounded-xs bg-foreground text-background text-[9px] font-bold inline-flex items-center justify-center shrink-0">
                {ws.name[0]?.toUpperCase() ?? "W"}
              </span>
              <span className="flex-1 truncate text-sm">{ws.name}</span>
              {ws.slug === current.slug && (
                <Check className="size-3.5 text-primary" />
              )}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href="/signup/workspace"
            className="flex items-center gap-2 cursor-pointer text-muted-foreground text-sm"
          >
            <Plus className="size-3.5" />
            {t("createWorkspace")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

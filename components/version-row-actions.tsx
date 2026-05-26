"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  rollbackToVersion,
  setReviewStatus,
} from "@/app/[workspace]/a/[slug]/actions";

type Status = "draft" | "pending" | "approved" | "changes_requested";

export function VersionRowActions({
  workspaceSlug,
  artifactId,
  versionId,
  versionNumber,
  reviewStatus,
  isCurrent,
  canEdit,
}: {
  workspaceSlug: string;
  artifactId: string;
  versionId: string;
  versionNumber: number;
  reviewStatus: Status;
  isCurrent: boolean;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const t = useTranslations("versions");
  const tt = useTranslations("toasts");
  const te = useTranslations("errors");

  function translateError(code: string): string {
    try {
      return te(code);
    } catch {
      return tt("generic");
    }
  }

  function runAction(fd: FormData, fn: (fd: FormData) => Promise<void>) {
    start(async () => {
      try {
        await fn(fd);
      } catch (err) {
        const msg = (err as Error).message || "generic";
        if (msg.startsWith("NEXT_")) throw err;
        toast.error(translateError(msg));
      }
    });
  }

  if (!canEdit) return null;

  return (
    <div className="flex items-center gap-2">
      {!isCurrent && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("workspaceSlug", workspaceSlug);
            fd.set("artifactId", artifactId);
            fd.set("versionNumber", String(versionNumber));
            runAction(fd, rollbackToVersion);
          }}
        >
          {pending && <Loader2 className="size-3 animate-spin" />}
          {t("rollback")}
        </Button>
      )}
      {reviewStatus === "pending" && (
        <>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              const fd = new FormData();
              fd.set("workspaceSlug", workspaceSlug);
              fd.set("versionId", versionId);
              fd.set("status", "approved");
              runAction(fd, setReviewStatus);
            }}
          >
            {pending && <Loader2 className="size-3 animate-spin" />}
            {t("approve")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              const fd = new FormData();
              fd.set("workspaceSlug", workspaceSlug);
              fd.set("versionId", versionId);
              fd.set("status", "changes_requested");
              runAction(fd, setReviewStatus);
            }}
          >
            {t("requestChanges")}
          </Button>
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ImageDown,
  Loader2,
  Link2,
  Check,
  MessageSquare,
  Smile,
  Settings,
  Info,
  X,
  GitBranch,
  GitCommit,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteArtifact } from "@/app/[workspace]/a/[slug]/actions";
import {
  VisibilityBadge,
  VISIBILITY_LABEL_KEYS,
  type Visibility,
} from "@/components/visibility-badge";
import { ArtifactTypeBadge } from "@/components/artifact-type-icon";
import { CommentsModal } from "@/components/comments-modal";
import { ReactionsModal } from "@/components/reactions-modal";
import { ArtifactSettingsModal } from "@/components/artifact-settings-modal";
import { PublishVersionDialog } from "@/components/publish-version-dialog";

export function FloatingActionCard({
  title,
  type,
  visibility,
  views,
  commentsCount,
  artifactId,
  publicPath,
  canExport,
  canEdit,
  canDelete,
  hasPassword,
  workspaceSlug,
  artifactSlug,
  reviewStatus,
  backHref,
  commentsSlot,
  reactionsSlot,
}: {
  title: string;
  type: "html" | "markdown" | "code";
  visibility: Visibility;
  views: number;
  commentsCount: number;
  artifactId: string;
  publicPath: string | null;
  canExport: boolean;
  canEdit: boolean;
  canDelete?: boolean;
  hasPassword: boolean;
  workspaceSlug?: string;
  artifactSlug?: string;
  reviewStatus?: "draft" | "pending" | "approved" | "changes_requested";
  backHref: string;
  commentsSlot: React.ReactNode;
  reactionsSlot: React.ReactNode;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const t = useTranslations("viewer");
  const tt = useTranslations("toasts");
  const tc = useTranslations("common");
  const tv = useTranslations("visibility");

  async function copyLink() {
    if (!publicPath) return;
    const url = new URL(publicPath, window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success(tt("linkCopied"));
    setTimeout(() => setCopied(false), 1500);
  }

  const te = useTranslations("errors");

  function translateError(code: string): string {
    return te.has(code) ? te(code) : tt("pngError");
  }

  async function exportPng() {
    setExporting(true);
    try {
      const res = await fetch(`/api/export/${artifactId}`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "pngError");
      }
      const { url } = (await res.json()) as { url: string };
      window.open(url, "_blank");
      toast.success(tt("pngGenerated"));
    } catch (e) {
      toast.error(translateError((e as Error).message));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <aside className="fixed right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col items-end gap-2">
        <DockButton
          icon={<ArrowLeft className="size-5" />}
          label={t("back")}
          as="link"
          href={backHref}
        />

        <div className="bg-surface/95 backdrop-blur-md border border-border rounded-md p-1 flex flex-col gap-0.5">
          <DockButton
            icon={<MessageSquare className="size-5" />}
            label={t("comments")}
            badge={commentsCount > 0 ? commentsCount : undefined}
            onClick={() => setCommentsOpen(true)}
          />
          <DockButton
            icon={<Smile className="size-5" />}
            label={t("react")}
            onClick={() => setReactionsOpen(true)}
          />

          {publicPath && (
            <DockButton
              icon={
                copied ? (
                  <Check className="size-5 text-primary" />
                ) : (
                  <Link2 className="size-5" />
                )
              }
              label={copied ? t("copied") : t("copyPublic")}
              onClick={copyLink}
            />
          )}

          {canExport && (
            <DockButton
              icon={
                exporting ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <ImageDown className="size-5" />
                )
              }
              label={t("exportPng")}
              onClick={exportPng}
              disabled={exporting}
            />
          )}

          {canEdit && workspaceSlug && artifactSlug && (
            <DockButton
              icon={<GitCommit className="size-5" />}
              label="Publish version"
              onClick={() => setPublishOpen(true)}
              accent
            />
          )}

          {canEdit && workspaceSlug && artifactSlug && (
            <DockButton
              icon={<GitBranch className="size-5" />}
              label="Versions"
              as="link"
              href={`/${workspaceSlug}/a/${artifactSlug}/versions`}
            />
          )}

          {canEdit && workspaceSlug && (
            <DockButton
              icon={<Settings className="size-5" />}
              label={t("visibility")}
              onClick={() => setSettingsOpen(true)}
              accent
            />
          )}

          {canDelete && workspaceSlug && (
            <DockButton
              icon={<Trash2 className="size-5" />}
              label={t("deleteBtn")}
              onClick={() => setDeleteOpen(true)}
            />
          )}
        </div>

        <DockButton
          icon={<Info className="size-5" />}
          label={t("info")}
          onClick={() => setInfoOpen(true)}
        />
      </aside>

      <CommentsModal open={commentsOpen} onOpenChange={setCommentsOpen}>
        {commentsSlot}
      </CommentsModal>

      <ReactionsModal open={reactionsOpen} onOpenChange={setReactionsOpen}>
        {reactionsSlot}
      </ReactionsModal>

      {canEdit && workspaceSlug && (
        <ArtifactSettingsModal
          artifactId={artifactId}
          workspaceSlug={workspaceSlug}
          currentVisibility={visibility}
          hasPassword={hasPassword}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}

      {canEdit && workspaceSlug && (
        <PublishVersionDialog
          artifactId={artifactId}
          workspaceSlug={workspaceSlug}
          defaultTitle={title}
          open={publishOpen}
          onOpenChange={setPublishOpen}
        />
      )}

      {canDelete && workspaceSlug && (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg">{t("deleteTitle")}</DialogTitle>
              <DialogDescription>
                {t("deleteConfirm", { title })}
              </DialogDescription>
            </DialogHeader>
            <form
              action={async (fd) => {
                fd.set("workspaceSlug", workspaceSlug);
                fd.set("artifactId", artifactId);
                setDeleting(true);
                try {
                  await deleteArtifact(fd);
                } catch (err) {
                  const msg = (err as Error).message || "";
                  if (msg.startsWith("NEXT_")) throw err; // redirect on success
                  setDeleting(false);
                  toast.error(tt("generic"));
                }
              }}
            >
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleting}
                >
                  {tc("cancel")}
                </Button>
                <Button type="submit" variant="destructive" disabled={deleting}>
                  {deleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  {t("deleteBtn")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg normal-case tracking-normal line-clamp-2 font-sans">
              {title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap gap-2">
              <ArtifactTypeBadge type={type} size="md" />
              <VisibilityBadge visibility={visibility} size="md" />
              {reviewStatus && (
                <span
                  className={`meta border px-2 py-1 ${statusPillClass(reviewStatus)}`}
                >
                  {reviewStatus.toUpperCase().replace("_", " ")}
                </span>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-px border border-border bg-border">
              <div className="bg-surface p-3 space-y-0.5">
                <dt className="meta">{t("viewsLabel")}</dt>
                <dd className="font-display font-bold text-2xl">{views}</dd>
              </div>
              <div className="bg-surface p-3 space-y-0.5">
                <dt className="meta">{t("commentsLabel")}</dt>
                <dd className="font-display font-bold text-2xl">
                  {commentsCount}
                </dd>
              </div>
              <div className="col-span-2 bg-surface p-3 space-y-0.5">
                <dt className="meta">{t("accessLabel")}</dt>
                <dd className="text-sm">{tv(VISIBILITY_LABEL_KEYS[visibility])}</dd>
              </div>
            </dl>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInfoOpen(false)}
              className="w-full"
            >
              <X className="size-4" />
              {tc("close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function statusPillClass(s: string): string {
  if (s === "approved") return "text-success border-success";
  if (s === "pending") return "text-warning border-warning";
  if (s === "changes_requested") return "text-destructive border-destructive";
  return "text-muted-foreground border-border";
}

function DockButton({
  icon,
  label,
  badge,
  onClick,
  href,
  as,
  disabled,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onClick?: () => void;
  href?: string;
  as?: "link";
  disabled?: boolean;
  accent?: boolean;
}) {
  const baseClasses = cn(
    "group relative size-10 rounded-sm flex items-center justify-center transition-colors",
    "bg-surface border border-border hover:bg-surface-2 hover:border-border-strong",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    accent && "bg-primary text-primary-foreground border-primary hover:bg-primary hover:border-primary",
    disabled && "opacity-50 cursor-not-allowed",
  );

  const inner = (
    <>
      {icon}
      {typeof badge === "number" && (
        <span className="absolute -top-1 -right-1 size-4 rounded-xs bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center font-display">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      <span
        role="tooltip"
        className={cn(
          "absolute right-full mr-2 px-2 py-1 rounded-xs text-[11px] font-display font-medium uppercase tracking-[0.06em] whitespace-nowrap",
          "bg-foreground text-background pointer-events-none",
          "opacity-0 group-hover:opacity-100",
          "transition-opacity duration-150",
        )}
      >
        {label}
      </span>
    </>
  );

  if (as === "link" && href) {
    return (
      <Link href={href} aria-label={label} className={baseClasses}>
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={baseClasses}
    >
      {inner}
    </button>
  );
}

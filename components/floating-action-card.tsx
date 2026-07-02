"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  ImageDown,
  Loader2,
  Share,
  Check,
  MessageSquare,
  Smile,
  Settings,
  Info,
  X,
  GitBranch,
  GitPullRequestArrow,
  RefreshCw,
  Trash2,
  MoreHorizontal,
  ChevronRight,
  Crosshair,
  MousePointer2,
} from "lucide-react";
import { toast } from "sonner";
import { useFormatter, useTranslations } from "next-intl";
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
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAnnotations } from "@/components/annotation-provider";
import { deleteArtifact } from "@/app/[workspace]/a/[slug]/actions";
import {
  VISIBILITY_LABEL_KEYS,
  type Visibility,
} from "@/components/visibility-badge";
import { ArtifactTypeBadge } from "@/components/artifact-type-icon";
import { ReactionsModal } from "@/components/reactions-modal";
import { ArtifactSettingsModal } from "@/components/artifact-settings-modal";
import { PublishVersionDialog } from "@/components/publish-version-dialog";
import { ProposeVersionDialog } from "@/components/propose-version-dialog";

// Shared so the "Edit" dropdown trigger matches the dock buttons exactly.
const DOCK_BASE =
  "group relative size-10 rounded-sm flex items-center justify-center transition-colors bg-surface border border-border hover:bg-surface-2 hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-[state=open]:bg-surface-2 data-[state=open]:border-border-strong";
const DOCK_TOOLTIP =
  "absolute right-full mr-2 px-2 py-1 rounded-xs text-[11px] font-display font-medium uppercase tracking-[0.06em] whitespace-nowrap bg-foreground text-background pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150";

// Comfortable ~44px command rows for the "More" menu (anti-misclick). Border is
// transparent at rest (no layout shift) and shows on hover/focus.
const MENU_ROW =
  "gap-3 rounded-lg px-2 py-2 text-sm border border-transparent focus:border-border-strong hover:border-border-strong data-[variant=destructive]:focus:border-destructive/40 data-[variant=destructive]:hover:border-destructive/40";
const MENU_LABEL = "px-2 pb-1 pt-1 text-[10px] uppercase tracking-[0.08em]";

/** Rounded icon chip used in the menu rows. */
function MenuChip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md",
        tone === "danger"
          ? "bg-destructive/10 text-destructive"
          : "bg-surface-2 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function FloatingActionCard({
  title,
  type,
  visibility,
  artifactId,
  shareHref,
  downloadHref,
  canExport,
  canEdit,
  canDelete,
  canPropose,
  pendingProposals = 0,
  hasPassword,
  workspaceSlug,
  artifactSlug,
  publishedAt,
  updatedAt,
  versionCount,
  backHref,
  reactionsSlot,
}: {
  title: string;
  type: "html" | "markdown" | "code";
  visibility: Visibility;
  commentsCount: number;
  artifactId: string;
  shareHref: string;
  downloadHref?: string;
  canExport: boolean;
  canEdit: boolean;
  canDelete?: boolean;
  canPropose?: boolean;
  pendingProposals?: number;
  hasPassword: boolean;
  workspaceSlug?: string;
  artifactSlug?: string;
  publishedAt: Date;
  updatedAt: Date;
  versionCount: number;
  backHref: string;
  reactionsSlot: React.ReactNode;
}) {
  const { annotations, sidebarOpen, setSidebarOpen, isPlacing, setIsPlacing, isInspecting, setIsInspecting } = useAnnotations();
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const t = useTranslations("viewer");
  const tt = useTranslations("toasts");
  const tc = useTranslations("common");
  const ta = useTranslations("annotations");
  const tv = useTranslations("visibility");
  const format = useFormatter();
  const fmtDate = (d: Date) =>
    format.dateTime(d, { day: "numeric", month: "short", year: "numeric" });
  const hasUpdates = versionCount > 1;
  const canManage = !!canEdit && !!workspaceSlug && !!artifactSlug;
  const canChangeAccess = !!canEdit && !!workspaceSlug;
  const canRemove = !!canDelete && !!workspaceSlug;
  // A member who isn't an editor may propose a version (review flow).
  const canProposeChanges = !!canPropose && !!workspaceSlug && !!artifactSlug;
  const hasEditorItems =
    canManage || canChangeAccess || canRemove || canProposeChanges;

  async function copyLink() {
    const url = new URL(shareHref, window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success(tt("linkCopied"));
    setTimeout(() => setCopied(false), 1500);
  }

  const te = useTranslations("errors");

  function translateError(code: string): string {
    return te.has(code) ? te(code) : tt("pngError");
  }

  function downloadFile() {
    if (!downloadHref) return;
    // Same-origin attachment response; the synthetic anchor lets the server's
    // Content-Disposition filename win and downloads without leaving the page.
    const a = document.createElement("a");
    a.href = downloadHref;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
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
      <aside className="hidden md:flex fixed right-4 top-1/2 -translate-y-1/2 z-40 flex-col items-end gap-2">
        {/* Back floats as its own pill just above the action dock — same right
            edge (no corner obstruction), but separated from the actions. */}
        <div className="bg-surface/95 backdrop-blur-md border border-border rounded-md p-1">
          <DockButton
            icon={<ArrowLeft className="size-5" />}
            label={t("back")}
            as="link"
            href={backHref}
          />
        </div>

        <div className="bg-surface/95 backdrop-blur-md border border-border rounded-md p-1 flex flex-col gap-0.5">
          <DockButton
            icon={
              copied ? (
                <Check className="size-5 text-primary" />
              ) : (
                <Share className="size-5" />
              )
            }
            label={copied ? t("copied") : t("share")}
            onClick={copyLink}
          />
          <DockButton
            icon={<MessageSquare className="size-5" />}
            label={t("comments")}
            badge={annotations.length > 0 ? annotations.length : undefined}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          />
          {/* Annotation mode — single entry point with popover */}
          <DropdownMenu onOpenChange={(open) => { if (!open && !isPlacing && !isInspecting) return; }}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={ta("annotate")}
                className={cn(
                  DOCK_BASE,
                  (isPlacing || isInspecting) && "bg-primary/10 border-primary/40 text-primary"
                )}
              >
                {isPlacing ? (
                  <Crosshair className="size-5" />
                ) : isInspecting ? (
                  <MousePointer2 className="size-5" />
                ) : (
                  <Crosshair className="size-5" />
                )}
                <span role="tooltip" className={DOCK_TOOLTIP}>
                  {isPlacing ? ta("cancelAnnotation") : isInspecting ? ta("cancelInspect") : ta("annotate")}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="left" align="center" sideOffset={10} className="w-80 p-1.5">
              <DropdownMenuLabel className={MENU_LABEL}>{ta("newComment")}</DropdownMenuLabel>
              <DropdownMenuItem
                className={cn(MENU_ROW, isInspecting && "bg-primary/10 text-primary")}
                onSelect={() => {
                  if (isInspecting) { setIsInspecting(false); return; }
                  setIsInspecting(true);
                  setIsPlacing(false);
                }}
              >
                <MenuChip><MousePointer2 className="size-4" /></MenuChip>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{ta("anchorElement")}</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/15 text-primary uppercase tracking-wide">{ta("recommended")}</span>
                  </div>
                  <span className="text-xs text-muted-foreground leading-relaxed">{ta("anchorElementDesc")}</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(MENU_ROW, isPlacing && "bg-primary/10 text-primary")}
                onSelect={() => {
                  if (isPlacing) { setIsPlacing(false); return; }
                  setIsPlacing(true);
                  setIsInspecting(false);
                }}
              >
                <MenuChip><Crosshair className="size-4" /></MenuChip>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-sm">{ta("markArea")}</span>
                  <span className="text-xs text-muted-foreground leading-relaxed">{ta("markAreaDesc")}</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DockButton
            icon={<Smile className="size-5" />}
            label={t("react")}
            onClick={() => setReactionsOpen(true)}
          />
          {downloadHref && (
            <DockButton
              icon={<Download className="size-5" />}
              label={t("download")}
              onClick={downloadFile}
            />
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("more")}
                className={DOCK_BASE}
              >
                <MoreHorizontal className="size-5" />
                <span role="tooltip" className={DOCK_TOOLTIP}>
                  {t("more")}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="left"
              align="end"
              sideOffset={10}
              className="min-w-56 p-1.5"
            >
              <DropdownMenuLabel className={MENU_LABEL}>
                {t("moreOptions")}
              </DropdownMenuLabel>
              {canExport && (
                <DropdownMenuItem
                  className={MENU_ROW}
                  disabled={exporting}
                  onSelect={() => setTimeout(exportPng)}
                >
                  <MenuChip>
                    <ImageDown />
                  </MenuChip>
                  {t("exportPng")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className={MENU_ROW}
                onSelect={() => setTimeout(() => setInfoOpen(true))}
              >
                <MenuChip>
                  <Info />
                </MenuChip>
                {t("info")}
              </DropdownMenuItem>

              {hasEditorItems && (
                <>
                  {canManage && (
                    <>
                      <DropdownMenuItem
                        className={MENU_ROW}
                        onSelect={() => setTimeout(() => setPublishOpen(true))}
                      >
                        <MenuChip>
                          <RefreshCw />
                        </MenuChip>
                        {t("updateVersion")}
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className={MENU_ROW}>
                        <Link
                          href={`/${workspaceSlug}/a/${artifactSlug}/versions`}
                        >
                          <MenuChip>
                            <GitBranch />
                          </MenuChip>
                          <span className="flex-1">{t("versions")}</span>
                          {pendingProposals > 0 && (
                            <span className="meta text-warning border border-warning px-1.5 py-0.5">
                              {pendingProposals}
                            </span>
                          )}
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  {canProposeChanges && !canManage && (
                    <>
                      <DropdownMenuItem
                        className={MENU_ROW}
                        onSelect={() => setTimeout(() => setProposeOpen(true))}
                      >
                        <MenuChip>
                          <GitPullRequestArrow />
                        </MenuChip>
                        {t("propose")}
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className={MENU_ROW}>
                        <Link
                          href={`/${workspaceSlug}/a/${artifactSlug}/versions`}
                        >
                          <MenuChip>
                            <GitBranch />
                          </MenuChip>
                          {t("versions")}
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  {canChangeAccess && (
                    <DropdownMenuItem
                      className={MENU_ROW}
                      onSelect={() => setTimeout(() => setSettingsOpen(true))}
                    >
                      <MenuChip>
                        <Settings />
                      </MenuChip>
                      {t("changeAccess")}
                    </DropdownMenuItem>
                  )}
                  {canRemove && (
                    <DropdownMenuItem
                      variant="destructive"
                      className={MENU_ROW}
                      onSelect={() => setTimeout(() => setDeleteOpen(true))}
                    >
                      <MenuChip tone="danger">
                        <Trash2 />
                      </MenuChip>
                      {t("deleteBtn")}
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile: compact bottom bar with primary actions + a "More" sheet for
          the rest. The right-side dock is hidden below md. */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-surface/95 backdrop-blur h-14 flex items-stretch">
        <BarButton
          icon={<ArrowLeft className="size-5" />}
          label={t("back")}
          href={backHref}
        />
        <BarButton
          icon={
            copied ? (
              <Check className="size-5 text-primary" />
            ) : (
              <Share className="size-5" />
            )
          }
          label={t("share")}
          onClick={copyLink}
        />
        <BarButton
          icon={<MessageSquare className="size-5" />}
          label={t("comments")}
          badge={annotations.length > 0 ? annotations.length : undefined}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        />
        <BarButton
          icon={<MoreHorizontal className="size-5" />}
          label={t("more")}
          onClick={() => setMoreOpen(true)}
        />
      </nav>

      <BottomSheet open={moreOpen} onOpenChange={setMoreOpen} title={t("more")}>
        <div className="px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] space-y-3">
          <div className="rounded-xl border border-border bg-surface overflow-hidden divide-y divide-border">
            <SheetRow
              icon={<Smile className="size-4" />}
              label={t("react")}
              onClick={() => {
                setMoreOpen(false);
                setReactionsOpen(true);
              }}
            />
            {canExport && (
              <SheetRow
                icon={
                  exporting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ImageDown className="size-4" />
                  )
                }
                label={t("exportPng")}
                disabled={exporting}
                onClick={() => {
                  setMoreOpen(false);
                  void exportPng();
                }}
              />
            )}
            {downloadHref && (
              <SheetRow
                icon={<Download className="size-4" />}
                label={t("download")}
                onClick={() => {
                  setMoreOpen(false);
                  downloadFile();
                }}
              />
            )}
            {canEdit && workspaceSlug && artifactSlug && (
              <SheetRow
                icon={<RefreshCw className="size-4" />}
                label={t("updateVersion")}
                onClick={() => {
                  setMoreOpen(false);
                  setPublishOpen(true);
                }}
              />
            )}
            {canProposeChanges && !canManage && (
              <SheetRow
                icon={<GitPullRequestArrow className="size-4" />}
                label={t("propose")}
                onClick={() => {
                  setMoreOpen(false);
                  setProposeOpen(true);
                }}
              />
            )}
            {((canEdit && workspaceSlug && artifactSlug) ||
              canProposeChanges) && (
              <SheetRow
                icon={<GitBranch className="size-4" />}
                label={t("versions")}
                href={`/${workspaceSlug}/a/${artifactSlug}/versions`}
                trailing={
                  <ChevronRight className="size-4 text-muted-foreground" />
                }
              />
            )}
            {canChangeAccess && (
              <SheetRow
                icon={<Settings className="size-4" />}
                label={t("changeAccess")}
                onClick={() => {
                  setMoreOpen(false);
                  setSettingsOpen(true);
                }}
              />
            )}
          </div>

          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <SheetRow
              icon={<Info className="size-4" />}
              label={t("info")}
              onClick={() => {
                setMoreOpen(false);
                setInfoOpen(true);
              }}
            />
          </div>

          {canDelete && workspaceSlug && (
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <SheetRow
                icon={<Trash2 className="size-4" />}
                label={t("deleteBtn")}
                destructive
                onClick={() => {
                  setMoreOpen(false);
                  setDeleteOpen(true);
                }}
              />
            </div>
          )}
        </div>
      </BottomSheet>

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

      {canProposeChanges && workspaceSlug && (
        <ProposeVersionDialog
          artifactId={artifactId}
          workspaceSlug={workspaceSlug}
          defaultTitle={title}
          open={proposeOpen}
          onOpenChange={setProposeOpen}
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
            </div>
            <dl className="grid grid-cols-2 gap-px border border-border bg-border">
              <div className="bg-surface p-3 space-y-0.5">
                <dt className="meta">{t("publishedLabel")}</dt>
                <dd className="text-sm">{fmtDate(publishedAt)}</dd>
              </div>
              {hasUpdates && (
                <div className="bg-surface p-3 space-y-0.5">
                  <dt className="meta">{t("updatedLabel")}</dt>
                  <dd className="text-sm">{fmtDate(updatedAt)}</dd>
                </div>
              )}
              <div
                className={cn(
                  "bg-surface p-3 space-y-0.5",
                  hasUpdates && "col-span-2",
                )}
              >
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

function BarButton({
  icon,
  label,
  badge,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onClick?: () => void;
  href?: string;
}) {
  const cls =
    "relative flex-1 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:bg-surface-2";
  const inner = (
    <>
      <span className="relative">
        {icon}
        {typeof badge === "number" && (
          <span className="absolute -top-1.5 -right-2 size-4 rounded-xs bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center font-display">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="text-[10px] font-display font-medium uppercase tracking-[0.06em]">
        {label}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} aria-label={label} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function SheetRow({
  icon,
  label,
  onClick,
  href,
  trailing,
  destructive,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  trailing?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const cls = cn(
    "flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface-2 active:bg-surface-2",
    destructive ? "text-destructive" : "text-foreground",
    disabled && "opacity-50 pointer-events-none",
  );
  const inner = (
    <>
      <span className={cn("shrink-0", !destructive && "text-muted-foreground")}>
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {trailing}
    </>
  );
  if (href) {
    return (
      <Link href={href} aria-label={label} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cls}
    >
      {inner}
    </button>
  );
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
  selected,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onClick?: () => void;
  href?: string;
  as?: "link";
  disabled?: boolean;
  accent?: boolean;
  selected?: boolean;
}) {
  const baseClasses = cn(
    DOCK_BASE,
    accent &&
      cn(
        "focus-visible:bg-primary focus-visible:text-primary-foreground focus-visible:border-primary",
        "active:bg-primary active:text-primary-foreground active:border-primary",
      ),
    selected && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:border-primary/90",
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
      <span role="tooltip" className={DOCK_TOOLTIP}>
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

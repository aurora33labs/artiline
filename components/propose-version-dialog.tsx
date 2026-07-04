"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, GitPullRequestArrow } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArtifactDropzone,
  type LoadedFile,
} from "@/components/artifact-dropzone";
import { ArtifactTypeBadge } from "@/components/artifact-type-icon";

/**
 * Propose a new version by re-uploading the artifact file. Unlike publishing,
 * this posts to /proposals: the version lands as `pending` for review and does
 * NOT go live. Any workspace member can use it.
 */
export function ProposeVersionDialog({
  artifactId,
  workspaceSlug,
  defaultTitle,
  members = [],
  open,
  onOpenChange,
}: {
  artifactId: string;
  workspaceSlug: string;
  defaultTitle: string;
  members?: { id: string; name: string | null; email: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState("");
  const [assignedReviewerId, setAssignedReviewerId] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const t = useTranslations("versions");
  const tn = useTranslations("new");
  const tc = useTranslations("common");
  const tt = useTranslations("toasts");
  const te = useTranslations("errors");

  function translateError(code: string): string {
    return te.has(code) ? te(code) : tt("generic");
  }

  function submit() {
    if (!file) {
      toast.error(tt("noFileFirst"));
      return;
    }
    const fd = new FormData();
    fd.set("workspaceSlug", workspaceSlug);
    fd.set("type", file.detected.type);
    fd.set("content", file.content);
    if (file.detected.language) fd.set("language", file.detected.language);
    fd.set("title", title.trim() || file.baseName);
    if (message.trim()) fd.set("message", message.trim());
    if (assignedReviewerId) fd.set("assignedReviewerId", assignedReviewerId);
    start(async () => {
      try {
        const res = await fetch(`/api/artifacts/${artifactId}/proposals`, {
          method: "POST",
          body: fd,
        });
        if (res.ok) {
          toast.success(t("proposed"));
          onOpenChange(false);
          setFile(null);
          router.refresh();
          return;
        }
        const { error } = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(translateError(error || "generic"));
      } catch {
        toast.error(translateError("generic"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{t("proposeTitle")}</DialogTitle>
          <DialogDescription>{t("proposeDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {file ? (
            <div className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{file.name}</div>
                <div className="meta">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
              <div className="flex items-center gap-2">
                <ArtifactTypeBadge
                  type={file.detected.type}
                  language={file.detected.language}
                  size="xs"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFile(null)}
                  disabled={pending}
                >
                  {t("replaceFile")}
                </Button>
              </div>
            </div>
          ) : (
            <ArtifactDropzone
              file={null}
              onFile={(f) => {
                setFile(f);
                if (!title.trim()) setTitle(f.baseName);
              }}
              onClear={() => setFile(null)}
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="propose-title">{tn("titleLabel")}</Label>
            <Input
              id="propose-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="propose-message">{t("messageLabel")}</Label>
            <Textarea
              id="propose-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={t("messagePlaceholder")}
            />
          </div>

          {members.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="propose-reviewer">{t("assignReviewer")}</Label>
              <Select
                value={assignedReviewerId || "__any__"}
                onValueChange={(v) =>
                  setAssignedReviewerId(v === "__any__" ? "" : v)
                }
              >
                <SelectTrigger id="propose-reviewer" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">{t("anyAdmin")}</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name ?? m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {tc("cancel")}
            </Button>
            <Button type="button" onClick={submit} disabled={pending || !file}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("proposing")}
                </>
              ) : (
                <>
                  <GitPullRequestArrow className="size-4" />
                  {t("propose")}
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

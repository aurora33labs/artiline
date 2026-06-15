"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, GitCommit } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
 * Publish a new version by re-uploading the artifact file (drop a new one with
 * changes). Goes live immediately. Uploads via the API route — not a server
 * action — so large files work behind the proxy.
 */
export function PublishVersionDialog({
  artifactId,
  workspaceSlug,
  defaultTitle,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  artifactId: string;
  workspaceSlug: string;
  defaultTitle: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChangeProp?.(next);
    else setInternalOpen(next);
  };

  const [file, setFile] = useState<LoadedFile | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState("");
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
    start(async () => {
      try {
        const res = await fetch(`/api/artifacts/${artifactId}/versions`, {
          method: "POST",
          body: fd,
        });
        if (res.ok) {
          toast.success(t("publish"));
          setOpen(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{t("publishTitle")}</DialogTitle>
          <DialogDescription>{t("reuploadDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {file ? (
            <div className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{file.name}</div>
                <div className="meta">
                  {(file.size / 1024).toFixed(1)} KB
                </div>
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
            <Label htmlFor="version-title">{tn("titleLabel")}</Label>
            <Input
              id="version-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="version-message">{t("messageLabel")}</Label>
            <Textarea
              id="version-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={t("messagePlaceholder")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {tc("cancel")}
            </Button>
            <Button type="button" onClick={submit} disabled={pending || !file}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("publishing")}
                </>
              ) : (
                <>
                  <GitCommit className="size-4" />
                  {t("publish")}
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

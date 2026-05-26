"use client";

import { useState, useTransition } from "react";
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
import { publishNewVersion } from "@/app/[workspace]/a/[slug]/actions";

export function PublishVersionDialog({
  artifactId,
  workspaceSlug,
  defaultTitle,
  defaultType,
  defaultContent,
  defaultLanguage,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  artifactId: string;
  workspaceSlug: string;
  defaultTitle: string;
  defaultType: "html" | "markdown" | "code";
  defaultContent: string;
  defaultLanguage: string | null;
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

  const [pending, start] = useTransition();
  const t = useTranslations("versions");
  const tn = useTranslations("new");
  const tc = useTranslations("common");
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{t("publishTitle")}</DialogTitle>
          <DialogDescription>{t("publishDesc")}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("workspaceSlug", workspaceSlug);
            fd.set("artifactId", artifactId);
            fd.set("type", defaultType);
            start(async () => {
              try {
                await publishNewVersion(fd);
                toast.success(t("publish"));
                setOpen(false);
              } catch (err) {
                const msg = (err as Error).message || "generic";
                if (msg.startsWith("NEXT_")) throw err;
                toast.error(translateError(msg));
              }
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="version-title">{tn("titleLabel")}</Label>
            <Input
              id="version-title"
              name="title"
              required
              maxLength={200}
              defaultValue={defaultTitle}
              className="h-11"
            />
          </div>

          {defaultType === "code" && (
            <div className="space-y-2">
              <Label htmlFor="version-language">Language</Label>
              <Input
                id="version-language"
                name="language"
                maxLength={50}
                defaultValue={defaultLanguage ?? ""}
                className="h-11"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="version-content">Content</Label>
            <Textarea
              id="version-content"
              name="content"
              required
              minLength={1}
              rows={12}
              defaultValue={defaultContent}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="version-message">Message</Label>
            <Textarea
              id="version-message"
              name="message"
              maxLength={500}
              rows={2}
              placeholder={t("messagePlaceholder")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
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
        </form>
      </DialogContent>
    </Dialog>
  );
}

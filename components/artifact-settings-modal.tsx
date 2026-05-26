"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Settings, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateArtifactVisibility } from "@/app/[workspace]/a/[slug]/actions";

type Visibility = "internal_pw" | "internal" | "public_pw" | "public";

export function ArtifactSettingsModal({
  artifactId,
  workspaceSlug,
  currentVisibility,
  hasPassword,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  hideTrigger,
}: {
  artifactId: string;
  workspaceSlug: string;
  currentVisibility: Visibility;
  hasPassword: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChangeProp?.(next);
    else setInternalOpen(next);
  };

  const [visibility, setVisibility] = useState<Visibility>(currentVisibility);
  const [changePassword, setChangePassword] = useState(false);
  const [pending, start] = useTransition();

  const tv = useTranslations("visibility");
  const tvo = useTranslations("visibility.options");
  const tc = useTranslations("common");
  const tn = useTranslations("new");
  const te = useTranslations("errors");
  const tt = useTranslations("toasts");

  const VIS_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
    { value: "internal", label: tvo("internal"), hint: tvo("internalHint") },
    {
      value: "internal_pw",
      label: tvo("internalPwForm"),
      hint: tvo("internalPwHint"),
    },
    { value: "public", label: tvo("publicOpen"), hint: tvo("publicHint") },
    {
      value: "public_pw",
      label: tvo("publicPw"),
      hint: tvo("publicPwHint"),
    },
  ];

  const needsPw = visibility === "internal_pw" || visibility === "public_pw";
  const passwordInputShown =
    needsPw && (!hasPassword || changePassword || visibility !== currentVisibility);
  const passwordRequired = needsPw && (!hasPassword || changePassword);

  function translateError(code: string): string {
    try {
      return te(code);
    } catch {
      return tt("generic");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setVisibility(currentVisibility);
          setChangePassword(false);
        }
      }}
    >
      {!hideTrigger && !isControlled && (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Settings className="size-4" />
            {tv("modalTitle")}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">{tv("modalTitle")}</DialogTitle>
          <DialogDescription>{tv("modalDesc")}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("workspaceSlug", workspaceSlug);
            fd.set("artifactId", artifactId);
            fd.set("visibility", visibility);
            start(async () => {
              try {
                await updateArtifactVisibility(fd);
                toast.success(tv("updated"));
                setOpen(false);
              } catch (err) {
                const code = (err as Error).message || "generic";
                if (code.startsWith("NEXT_")) throw err;
                toast.error(translateError(code));
              }
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>{tv("levelLabel")}</Label>
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v as Visibility)}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {opt.hint}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsPw && hasPassword && visibility === currentVisibility && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="changePassword"
                checked={changePassword}
                onChange={(e) => setChangePassword(e.target.checked)}
                className="size-4 accent-primary"
              />
              <span>{tv("changePassword")}</span>
            </label>
          )}

          {passwordInputShown && (
            <div className="space-y-2">
              <Label htmlFor="password">{tc("password")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required={passwordRequired}
                minLength={4}
                placeholder={tn("passwordHint")}
                className="h-11"
              />
              {needsPw && hasPassword && !changePassword && visibility !== currentVisibility && (
                <p className="text-xs text-muted-foreground">
                  {tv("keepPassword")}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {tc("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

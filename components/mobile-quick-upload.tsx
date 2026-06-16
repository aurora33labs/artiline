"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ArtifactTypeBadge } from "@/components/artifact-type-icon";
import {
  loadFile,
  ACCEPT_DOCUMENTS,
  MAX_UPLOAD_MB,
  type LoadedFile,
} from "@/lib/artifact-upload";

type Visibility = "internal_pw" | "internal" | "public_pw" | "public";

/**
 * Mobile "New" tab. Instead of routing to /workspace/new (high exit friction on
 * a phone), it opens the native document picker directly. On pick it shows a
 * minimal bottom sheet (title + visibility) and posts to /api/artifacts —
 * cancelling the picker or dismissing the sheet leaves the user where they were.
 */
export function MobileQuickUpload({ workspaceSlug }: { workspaceSlug: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("internal");
  const [pending, start] = useTransition();
  const router = useRouter();
  const needsPw = visibility === "internal_pw" || visibility === "public_pw";

  const t = useTranslations("new");
  const tv = useTranslations("visibility.options");
  const te = useTranslations("errors");
  const tt = useTranslations("toasts");
  const tc = useTranslations("common");
  const tn = useTranslations("navTop");

  const VIS_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
    { value: "internal", label: tv("internal"), hint: tv("internalHint") },
    {
      value: "internal_pw",
      label: tv("internalPwForm"),
      hint: tv("internalPwHintShort"),
    },
    { value: "public", label: tv("publicOpen"), hint: tv("publicHint") },
    { value: "public_pw", label: tv("publicPw"), hint: tv("publicPwHint") },
  ];

  function translateError(code: string): string {
    return te.has(code) ? te(code) : tt("generic");
  }

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    try {
      const loaded = await loadFile(picked);
      setTitle(loaded.baseName);
      setVisibility("internal");
      setFile(loaded);
    } catch (err) {
      const code = (err as Error).message;
      if (code === "ERR_FILE_MAX_SIZE") {
        toast.error(te(code, { maxMB: MAX_UPLOAD_MB }));
      } else {
        toast.error(te.has(code) ? te(code) : te("ERR_FILE_READ"));
      }
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData(e.currentTarget);
    fd.set("workspaceSlug", workspaceSlug);
    fd.set("type", file.detected.type);
    fd.set("content", file.content);
    if (file.detected.language) fd.set("language", file.detected.language);
    fd.set("visibility", visibility);
    start(async () => {
      try {
        const res = await fetch("/api/artifacts", { method: "POST", body: fd });
        if (res.ok) {
          const { slug } = (await res.json()) as { slug: string };
          router.push(`/${workspaceSlug}/a/${slug}`);
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
    <>
      <button
        type="button"
        aria-label={tn("new")}
        onClick={() => inputRef.current?.click()}
        className="flex-1 flex flex-col items-center justify-center gap-1 text-primary hover:text-primary transition-colors focus-visible:outline-none focus-visible:bg-surface-2"
      >
        <Plus className="size-5" />
        <span className="text-[10px] font-display font-medium uppercase tracking-[0.06em]">
          {tn("new")}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_DOCUMENTS}
        hidden
        onChange={onPick}
      />

      <BottomSheet
        open={!!file}
        onOpenChange={(o) => {
          if (!o && !pending) setFile(null);
        }}
        title={t("quickTitle")}
      >
        {file && (
          <form
            onSubmit={submit}
            className="space-y-5 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
          >
            <div className="space-y-1">
              <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
                {t("quickTitle")}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground truncate font-mono">
                  {file.name}
                </span>
                <ArtifactTypeBadge
                  type={file.detected.type}
                  language={file.detected.language}
                  size="xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="m-title">{t("titleLabel")}</Label>
              <Input
                id="m-title"
                name="title"
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label>{t("visibility")}</Label>
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

            {needsPw && (
              <div className="space-y-2">
                <Label htmlFor="m-password">{tc("password")}</Label>
                <Input
                  id="m-password"
                  name="password"
                  type="password"
                  required
                  minLength={4}
                  placeholder={t("passwordHint")}
                  className="h-11"
                />
              </div>
            )}

            <Button type="submit" disabled={pending} className="w-full h-11">
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("publishing")}
                </>
              ) : (
                t("publish")
              )}
            </Button>
          </form>
        )}
      </BottomSheet>
    </>
  );
}

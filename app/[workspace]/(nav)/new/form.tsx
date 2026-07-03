"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import {
  ArtifactDropzone,
  type LoadedFile,
} from "@/components/artifact-dropzone";
import { ArtifactTypeBadge } from "@/components/artifact-type-icon";

type Visibility = "internal_pw" | "internal" | "public_pw" | "public";

export function NewArtifactForm({ workspaceSlug }: { workspaceSlug: string }) {
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

  const VIS_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
    { value: "internal", label: tv("internal"), hint: tv("internalHint") },
    { value: "internal_pw", label: tv("internalPwForm"), hint: tv("internalPwHintShort") },
    { value: "public", label: tv("publicOpen"), hint: tv("publicHint") },
    { value: "public_pw", label: tv("publicPw"), hint: tv("publicPwHint") },
  ];

  function translateError(code: string): string {
    try {
      return te(code);
    } catch {
      return tt("generic");
    }
  }

  if (!file) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <div className="meta">{t("firstStepMeta")}</div>
          <h1 className="text-3xl">{t("dropFile")}</h1>
          <p className="text-muted-foreground text-sm">{t("dropBody")}</p>
        </div>
        <ArtifactDropzone
          file={null}
          onFile={(f) => {
            setFile(f);
            if (!title.trim()) setTitle(f.baseName);
          }}
          onClear={() => setFile(null)}
        />
        <p className="text-sm text-muted-foreground">
          {t("externalSitePrompt")}{" "}
          <Link href={`/${workspaceSlug}/new/external`} className="text-primary hover:underline">
            {t("externalSiteLink")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) {
          toast.error(tt("noFileFirst"));
          return;
        }
        const fd = new FormData(e.currentTarget);
        fd.set("workspaceSlug", workspaceSlug);
        fd.set("type", file.detected.type);
        fd.set("content", file.content);
        if (file.detected.language) fd.set("language", file.detected.language);
        fd.set("visibility", visibility);
        start(async () => {
          // Upload via the API route (not a server action): /api isn't rewritten
          // by the proxy and isn't capped by serverActions.bodySizeLimit, so large
          // files upload reliably on custom domains too.
          try {
            const res = await fetch("/api/artifacts", {
              method: "POST",
              body: fd,
            });
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
      }}
      className="grid lg:grid-cols-[3fr_2fr] gap-6 max-w-6xl mx-auto"
    >
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="meta">{t("previewLabel")}</div>
            <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
              {file.name}
            </h2>
          </div>
          <ArtifactTypeBadge
            type={file.detected.type}
            language={file.detected.language}
          />
        </div>
        <div className="rounded-md border border-border bg-surface overflow-hidden h-[60vh]">
          <FilePreview file={file} />
        </div>
        <div className="meta">
          {t("fileMeta", {
            kb: (file.size / 1024).toFixed(1),
            lines: file.content.split("\n").length,
          })}
        </div>
      </section>

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="meta">{t("detailsLabel")}</div>
          <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
            {t("configure")}
          </h2>
        </div>

        <ArtifactDropzone
          file={file}
          onFile={(f) => {
            setFile(f);
            if (!title.trim()) setTitle(f.baseName);
          }}
          onClear={() => setFile(null)}
        />

        <div className="space-y-2">
          <Label htmlFor="title">{t("titleLabel")}</Label>
          <Input
            id="title"
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
            <Label htmlFor="password">{tc("password")}</Label>
            <Input
              id="password"
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
      </section>
    </form>
  );
}

function FilePreview({ file }: { file: LoadedFile }) {
  if (file.detected.type === "html") {
    return (
      <iframe
        srcDoc={file.content}
        sandbox="allow-scripts"
        title="preview"
        className="w-full h-full border-0 bg-white"
      />
    );
  }
  if (file.detected.type === "markdown") {
    return (
      <pre className="w-full h-full overflow-auto p-6 text-sm whitespace-pre-wrap font-sans text-foreground/80">
        {file.content.slice(0, 4000)}
      </pre>
    );
  }
  return (
    <pre className="w-full h-full overflow-auto p-6 text-xs font-mono leading-relaxed text-foreground/80">
      {file.content.slice(0, 4000)}
    </pre>
  );
}

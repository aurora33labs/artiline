"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Upload, FileText, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ArtifactTypeBadge } from "@/components/artifact-type-icon";
import { cn } from "@/lib/utils";
import {
  detectArtifact,
  basenameWithoutExt,
  type Detected,
} from "@/lib/detect-artifact";

export type LoadedFile = {
  name: string;
  baseName: string;
  size: number;
  content: string;
  detected: Detected;
};

const MAX_BYTES = 10_000_000;
const ACCEPT =
  ".html,.htm,.md,.markdown,.mdx,.ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.go,.rs,.css,.scss,.json,.sh,.bash,.zsh,.sql,.yml,.yaml,.toml,.xml,.svg,.java,.kt,.swift,.rb,.php,.c,.h,.cpp,.hpp,.cs,.txt";

function looksTexty(file: File): boolean {
  if (!file.type) return true;
  return (
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.type === "application/xml" ||
    file.type === "image/svg+xml" ||
    /javascript|typescript|x-sh|x-yaml|toml/i.test(file.type)
  );
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("ERR_FILE_READ"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

export function ArtifactDropzone({
  file,
  onFile,
  onClear,
  compact,
}: {
  file: LoadedFile | null;
  onFile: (f: LoadedFile) => void;
  onClear: () => void;
  compact?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("dropzone");
  const te = useTranslations("errors");

  async function process(picked: File) {
    if (!looksTexty(picked)) {
      toast.error(te("ERR_FILE_TEXT_ONLY"));
      return;
    }
    if (picked.size > MAX_BYTES) {
      toast.error(
        te("ERR_FILE_MAX_SIZE", { maxMB: (MAX_BYTES / 1_000_000).toFixed(0) }),
      );
      return;
    }
    try {
      const content = await readAsText(picked);
      if (!content.trim()) {
        toast.error(te("ERR_FILE_EMPTY"));
        return;
      }
      const detected = detectArtifact(picked.name, content);
      onFile({
        name: picked.name,
        baseName: basenameWithoutExt(picked.name),
        size: picked.size,
        content,
        detected,
      });
    } catch (err) {
      const code = (err as Error).message;
      try {
        toast.error(te(code));
      } catch {
        toast.error(te("ERR_FILE_READ"));
      }
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const picked = e.dataTransfer.files?.[0];
    if (picked) void process(picked);
  }

  function openPicker() {
    inputRef.current?.click();
  }

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  }

  if (file) {
    return (
      <div className="rounded-md border border-border bg-surface p-4 flex items-start gap-3">
        <div className="size-10 rounded-sm border border-border bg-surface-2 flex items-center justify-center shrink-0">
          <FileText className="size-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate font-mono text-sm">
              {file.name}
            </span>
            <ArtifactTypeBadge
              type={file.detected.type}
              language={file.detected.language}
              size="xs"
            />
          </div>
          <div className="meta">
            {t("fileMeta", {
              kb: (file.size / 1024).toFixed(1),
              lines: file.content.split("\n").length,
            })}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          aria-label={t("removeFile")}
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t("ariaLabel")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={openPicker}
      onKeyDown={handleKey}
      className={cn(
        "relative rounded-md cursor-pointer transition-colors",
        "flex flex-col items-center justify-center text-center",
        compact ? "p-8 min-h-[180px]" : "p-12 min-h-[60vh]",
        "border-2 border-dashed",
        dragOver
          ? "border-primary bg-surface-2"
          : "border-border-strong bg-surface hover:bg-surface-2",
      )}
    >
      <div className="relative space-y-6 max-w-md">
        <div className="meta">{t("label")}</div>
        <div
          className={cn(
            "size-14 rounded-sm mx-auto flex items-center justify-center transition-colors",
            "border border-border-strong",
            dragOver ? "bg-primary text-primary-foreground" : "bg-surface-2 text-foreground",
          )}
        >
          <Upload className="size-6" />
        </div>

        <div className="space-y-2">
          <h3 className="text-xl">
            {dragOver ? t("dragHere") : t("dragFile")}
          </h3>
          <p className="text-muted-foreground text-sm">{t("subtype")}</p>
        </div>

        {!compact && (
          <div className="flex flex-wrap justify-center gap-1 pt-2">
            {["HTML", "MD", "TS", "PY", "GO", "RS", "JSON"].map((ext) => (
              <span
                key={ext}
                className="px-2 py-0.5 text-[10px] rounded-xs border border-border bg-surface-2 text-muted-foreground font-display font-medium uppercase tracking-[0.06em]"
              >
                {ext}
              </span>
            ))}
          </div>
        )}

        <div className="meta pt-2">{t("maxSize")}</div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) void process(picked);
          e.target.value = "";
        }}
      />
    </div>
  );
}

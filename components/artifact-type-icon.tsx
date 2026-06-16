import { Atom, FileCode2, FileText, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { isReactRenderable } from "@/lib/detect-artifact";

export type ArtifactType = "html" | "markdown" | "code";

const META: Record<
  ArtifactType,
  { Icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  html: { Icon: Globe, label: "HTML" },
  markdown: { Icon: FileText, label: "MD" },
  code: { Icon: FileCode2, label: "Code" },
};

export function ArtifactTypeBadge({
  type,
  language,
  size = "sm",
  className,
}: {
  type: ArtifactType;
  language?: string | null;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const react = isReactRenderable(type, language);
  const meta = META[type];
  const Icon = react ? Atom : meta.Icon;
  const iconSize =
    size === "xs" ? "size-3" : size === "md" ? "size-3.5" : "size-3";
  const padding =
    size === "xs"
      ? "px-1.5 py-0.5 text-[10px]"
      : size === "md"
        ? "px-2.5 py-1 text-xs"
        : "px-2 py-0.5 text-[11px]";
  const label = react
    ? "REACT"
    : type === "code" && language
      ? language.toUpperCase()
      : meta.label;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-xs border border-border bg-surface text-foreground font-display font-medium uppercase tracking-[0.06em]",
        padding,
        className,
      )}
    >
      <Icon className={iconSize} />
      <span>{label}</span>
    </span>
  );
}

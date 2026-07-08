import { Users, Globe2, Lock, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type Visibility = "internal" | "internal_pw" | "public" | "public_pw";

export const VISIBILITY_ICONS: Record<
  Visibility,
  React.ComponentType<{ className?: string }>
> = {
  internal: Users,
  internal_pw: KeyRound,
  public: Globe2,
  public_pw: Lock,
};
const ICONS = VISIBILITY_ICONS;

const TONES: Record<Visibility, string> = {
  internal: "border-border text-muted-foreground",
  internal_pw: "border-border text-muted-foreground",
  public: "border-primary/40 text-primary bg-accent-tint",
  public_pw: "border-primary/40 text-primary bg-accent-tint",
};

export const VISIBILITY_LABEL_KEYS: Record<
  Visibility,
  "internal" | "internalPw" | "public" | "publicPw"
> = {
  internal: "internal",
  internal_pw: "internalPw",
  public: "public",
  public_pw: "publicPw",
};

export function VisibilityBadge({
  visibility,
  size = "sm",
  iconOnly,
  className,
}: {
  visibility: Visibility;
  size?: "xs" | "sm" | "md";
  iconOnly?: boolean;
  className?: string;
}) {
  const t = useTranslations("visibility");
  const Icon = ICONS[visibility];
  const label = t(VISIBILITY_LABEL_KEYS[visibility]);
  const iconSize =
    size === "xs" ? "size-3" : size === "md" ? "size-3.5" : "size-3";
  const padding =
    size === "xs"
      ? "px-1.5 py-0.5 text-[10px]"
      : size === "md"
        ? "px-2.5 py-1 text-xs"
        : "px-2 py-0.5 text-[11px]";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-xs border font-display font-medium uppercase tracking-[0.06em]",
        TONES[visibility],
        padding,
        className,
      )}
      title={label}
      aria-label={label}
    >
      <Icon className={iconSize} />
      {!iconOnly && <span>{label}</span>}
    </span>
  );
}

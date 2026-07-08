"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { VISIBILITY_ICONS, type Visibility } from "@/components/visibility-badge";

const ORDER: Visibility[] = ["internal", "internal_pw", "public", "public_pw"];

const OPTION_KEYS: Record<Visibility, { label: string; hint: string }> = {
  internal: { label: "internal", hint: "internalHint" },
  internal_pw: { label: "internalPwForm", hint: "internalPwHintShort" },
  public: { label: "publicOpen", hint: "publicHint" },
  public_pw: { label: "publicPw", hint: "publicPwHint" },
};

/**
 * Always-visible list (not a dropdown) — there are only 4 levels, so hiding
 * them behind a trigger costs a click for no reason. Clean share expands
 * inline as a 5th row once a public level is picked, instead of living only
 * in the post-publish settings modal.
 */
export function VisibilityPicker({
  value,
  onChange,
  cleanShare,
  onCleanShareChange,
  name,
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
  cleanShare: boolean;
  onCleanShareChange: (v: boolean) => void;
  name: string;
}) {
  const t = useTranslations("visibility");
  const isPublic = value === "public" || value === "public_pw";

  return (
    <div className="border border-border rounded-md bg-surface overflow-hidden">
      {ORDER.map((opt) => {
        const Icon = VISIBILITY_ICONS[opt];
        const selected = value === opt;
        const keys = OPTION_KEYS[opt];
        return (
          <label
            key={opt}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 border-b border-border cursor-pointer transition-colors",
              selected ? "bg-accent-tint" : "hover:bg-surface-2",
            )}
          >
            <span
              className={cn(
                "flex items-center justify-center size-7 rounded-sm border shrink-0",
                selected
                  ? "border-primary text-primary"
                  : "border-border-strong text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="text-sm font-medium">{t(`options.${keys.label}`)}</span>
              <span className="text-xs text-muted-foreground">{t(`options.${keys.hint}`)}</span>
            </span>
            <input
              type="radio"
              name={name}
              className="size-4 accent-primary shrink-0"
              checked={selected}
              onChange={() => onChange(opt)}
            />
          </label>
        );
      })}
      <div
        className={cn(
          "grid bg-surface-2 transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]",
          isPublic ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden min-h-0">
          <div className="flex flex-col gap-1.5 pl-[3.25rem] pr-3 py-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cleanShare}
                onChange={(e) => onCleanShareChange(e.target.checked)}
                className="size-4 accent-primary"
              />
              <span className="font-medium">{t("cleanShareLabel")}</span>
            </label>
            <p className="text-xs text-muted-foreground pl-6">{t("cleanShareHint")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

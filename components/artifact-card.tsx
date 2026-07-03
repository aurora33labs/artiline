import Link from "next/link";
import { Eye } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArtifactThumb } from "@/components/artifact-thumb";
import { ArtifactTypeBadge, type ArtifactType } from "@/components/artifact-type-icon";
import {
  VisibilityBadge,
  type Visibility,
} from "@/components/visibility-badge";

export type ArtifactCardData = {
  id: string;
  slug: string;
  title: string;
  type: ArtifactType;
  // Only the snippet (first KBs) reaches the list — never the full content.
  snippet: string | null;
  thumbKey: string | null;
  language: string | null;
  visibility: Visibility;
  versionNumber: number;
  views: number;
  updatedAt: Date;
  authorName: string | null;
  authorEmail: string;
  authorImage: string | null;
};

function initials(src: string): string {
  const parts = src.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? "?").toUpperCase();
  return ((parts[0][0] ?? "") + (parts[1][0] ?? "")).toUpperCase();
}

export async function ArtifactCard({
  artifact,
  workspaceSlug,
}: {
  artifact: ArtifactCardData;
  workspaceSlug: string;
}) {
  const formatter = await getFormatter();
  const t = await getTranslations("artifact");

  return (
    <Link
      href={`/${workspaceSlug}/a/${artifact.slug}`}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <article className="rounded-md overflow-hidden bg-surface border border-border group-hover:border-border-strong transition-colors">
        <div className="relative aspect-[4/3] overflow-hidden bg-background">
          <ArtifactThumb
            type={artifact.type}
            snippet={artifact.snippet}
            thumbKey={artifact.thumbKey}
            language={artifact.language}
          />
        </div>

        <div className="px-3 py-2.5 border-t border-border space-y-1.5">
          <h3 className="font-sans font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors normal-case tracking-normal">
            {artifact.title}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <VisibilityBadge visibility={artifact.visibility} size="xs" />
            <ArtifactTypeBadge
              type={artifact.type}
              language={artifact.language}
              size="xs"
            />
            <span className="inline-flex items-center rounded-xs border border-border bg-surface font-display font-medium uppercase tracking-[0.06em] px-1.5 py-0.5 text-[10px] text-muted-foreground">
              v{artifact.versionNumber}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 meta">
            <span className="inline-flex items-center gap-1.5 min-w-0">
              {artifact.authorImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={artifact.authorImage}
                  alt=""
                  className="size-4 rounded-full object-cover border border-border shrink-0"
                />
              ) : (
                <span className="size-4 rounded-full bg-surface-2 border border-border-strong text-foreground text-[8px] font-display font-bold flex items-center justify-center shrink-0">
                  {initials(artifact.authorName ?? artifact.authorEmail)}
                </span>
              )}
              <span className="truncate">
                {artifact.authorName ?? artifact.authorEmail}
              </span>
            </span>
            <span className="inline-flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1">
                <Eye className="size-3" />
                {artifact.views}
              </span>
              <span>{shortRelative(artifact.updatedAt, formatter, t)}</span>
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function shortRelative(
  date: Date,
  formatter: Awaited<ReturnType<typeof getFormatter>>,
  t: Awaited<ReturnType<typeof getTranslations<"artifact">>>,
): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t("now");
  if (minutes < 60) return `${minutes}${t("minutesShort")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t("hoursShort")}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}${t("daysShort")}`;
  return formatter
    .dateTime(date, { day: "numeric", month: "short" })
    .toUpperCase();
}

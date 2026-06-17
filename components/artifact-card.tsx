import Link from "next/link";
import { Eye } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArtifactThumb } from "@/components/artifact-thumb";
import { ArtifactTypeBadge } from "@/components/artifact-type-icon";
import {
  VisibilityBadge,
  type Visibility,
} from "@/components/visibility-badge";

export type ArtifactCardData = {
  id: string;
  slug: string;
  title: string;
  type: "html" | "markdown" | "code";
  // Only the snippet (first KBs) reaches the list — never the full content.
  snippet: string | null;
  thumbKey: string | null;
  language: string | null;
  visibility: Visibility;
  views: number;
  createdAt: Date;
  updatedAt: Date;
};

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

        <div className="px-3 py-2.5 border-t border-border space-y-2">
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
          </div>
          <div className="flex items-center justify-between meta">
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3" />
              {artifact.views}
            </span>
            <span className="inline-flex items-center gap-2">
              <span>{fmtDate(artifact.createdAt, formatter)}</span>
              <span>{shortRelative(artifact.updatedAt, formatter, t)}</span>
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function fmtDate(
  date: Date,
  formatter: Awaited<ReturnType<typeof getFormatter>>,
): string {
  return formatter
    .dateTime(date, { day: "numeric", month: "short", year: "numeric" })
    .toUpperCase();
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

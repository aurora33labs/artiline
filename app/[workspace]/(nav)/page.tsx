import { desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { ArtifactCard } from "@/components/artifact-card";
import { EmptyDashboard } from "@/components/empty-dashboard";

export default async function WorkspaceHome({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace } = await requireMemberPage(slug);

  const list = await db
    .select({
      id: schema.artifacts.id,
      slug: schema.artifacts.slug,
      visibility: schema.artifacts.visibility,
      views: schema.artifacts.views,
      updatedAt: schema.artifacts.updatedAt,
      title: schema.artifactVersions.title,
      type: schema.artifactVersions.type,
      content: schema.artifactVersions.content,
      language: schema.artifactVersions.language,
    })
    .from(schema.artifacts)
    .innerJoin(
      schema.artifactVersions,
      eq(schema.artifactVersions.id, schema.artifacts.currentVersionId),
    )
    .where(eq(schema.artifacts.workspaceId, workspace.id))
    .orderBy(desc(schema.artifacts.updatedAt));

  if (list.length === 0) {
    return <EmptyDashboard workspaceSlug={slug} />;
  }

  const t = await getTranslations("dashboard");

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-2">
          <div className="meta">
            {t("catalogLabel", { name: workspace.name.toUpperCase() })}
          </div>
          <h1 className="text-3xl">
            {t("artifactsCount", { count: String(list.length).padStart(3, "0") })}
          </h1>
        </div>
      </div>

      <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
        {list.map((a) => (
          <ArtifactCard
            key={a.id}
            workspaceSlug={slug}
            artifact={{
              id: a.id,
              slug: a.slug,
              title: a.title,
              type: a.type,
              content: a.content,
              language: a.language,
              visibility: a.visibility,
              views: a.views,
              updatedAt: a.updatedAt,
            }}
          />
        ))}
      </div>
    </div>
  );
}

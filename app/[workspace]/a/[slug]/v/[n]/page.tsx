import { notFound } from "next/navigation";
import { requireMemberPage } from "@/lib/tenant";
import { resolveArtifactVersion } from "@/lib/artifact-resolve";
import { ArtifactViewer } from "@/components/artifact-viewer";

export default async function WorkspacePinnedVersionView({
  params,
}: {
  params: Promise<{ workspace: string; slug: string; n: string }>;
}) {
  const { workspace, slug, n } = await params;
  const { workspace: ws } = await requireMemberPage(workspace);

  const versionNumber = Number.parseInt(n, 10);
  if (!Number.isFinite(versionNumber) || versionNumber <= 0) notFound();

  const resolved = await resolveArtifactVersion(slug, versionNumber);
  if (!resolved || resolved.artifact.workspaceId !== ws.id) notFound();
  const { artifact, version } = resolved;

  return (
    <main className="fixed inset-0 bg-background overflow-auto">
      <link rel="canonical" href={`/${workspace}/a/${artifact.slug}`} />
      <ArtifactViewer
        artifact={{
          type: version.type,
          content: version.content,
          language: version.language,
        }}
        fullscreen
      />
    </main>
  );
}

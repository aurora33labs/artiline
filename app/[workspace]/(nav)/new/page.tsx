import { requireMemberPage } from "@/lib/tenant";
import { NewArtifactForm } from "./form";

export default async function NewArtifact({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  await requireMemberPage(slug);

  return <NewArtifactForm workspaceSlug={slug} />;
}

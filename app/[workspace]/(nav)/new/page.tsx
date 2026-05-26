import { requireMember } from "@/lib/tenant";
import { NewArtifactForm } from "./form";

export default async function NewArtifact({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  await requireMember(slug);

  return <NewArtifactForm workspaceSlug={slug} />;
}

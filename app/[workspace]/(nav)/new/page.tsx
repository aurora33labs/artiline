import { requireMemberPage } from "@/lib/tenant";
import { externalReviewsEnabled } from "@/lib/external-reviews";
import { NewArtifactForm } from "./form";

export default async function NewArtifact({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  await requireMemberPage(slug);

  // Passed as a prop rather than imported in the client component — the flag
  // lives in a "server-only" module (same pattern as ALL_EVENTS in webhooks).
  return (
    <NewArtifactForm
      workspaceSlug={slug}
      externalReviews={externalReviewsEnabled()}
    />
  );
}

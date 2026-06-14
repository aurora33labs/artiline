import { headers } from "next/headers";
import { evaluateAccess } from "@/lib/visibility";
import { resolveCurrentArtifact } from "@/lib/artifact-resolve";
import { getContent, rawContentPath } from "@/lib/artifact-content";
import { ArtifactViewer } from "@/components/artifact-viewer";
import { auth } from "@/auth";
import { recordView, extractIp } from "@/lib/tracking";

export default async function EmbedView({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pw?: string }>;
}) {
  const { slug } = await params;
  const { pw } = await searchParams;

  const resolved = await resolveCurrentArtifact(slug);
  if (!resolved) return <EmbedError code="not_found" />;

  // Embed only supports fully public artifacts in v1. internal* requires login
  // (impossible inside iframe) and password gating is not yet supported via
  // signed query token. Private artifacts return a placeholder.
  if (resolved.artifact.visibility !== "public") {
    return <EmbedError code="private" />;
  }

  const session = await auth();
  const access = await evaluateAccess(resolved.artifact, {
    sessionUserId: session?.user?.id ?? null,
    passwordAttempt: pw ?? null,
  });
  if (access.kind !== "ok") return <EmbedError code={access.kind} />;

  const reqHeaders = await headers();
  await recordView({
    artifactId: resolved.artifact.id,
    versionId: resolved.version.id,
    ip: extractIp(reqHeaders),
    userAgent: reqHeaders.get("user-agent"),
    referrer: reqHeaders.get("referer"),
    userId: session?.user?.id ?? null,
  }).catch(() => {});

  const isHtml = resolved.version.type === "html";
  const content = isHtml ? null : await getContent(resolved.version);

  return (
    <div className="fixed inset-0 bg-background overflow-auto">
      <ArtifactViewer
        artifact={{
          type: resolved.version.type,
          language: resolved.version.language,
          contentSrc: isHtml ? rawContentPath({ slug }) : null,
          content,
        }}
        fullscreen
      />
    </div>
  );
}

function EmbedError({ code }: { code: string }) {
  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center p-6">
      <div className="meta">EMBED · {code.toUpperCase()}</div>
    </div>
  );
}

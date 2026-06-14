import { HtmlViewer } from "./Html";
import { MarkdownViewer } from "./Markdown";
import { CodeViewer } from "./Code";

export type ArtifactRender = {
  type: "html" | "markdown" | "code";
  language?: string | null;
  // HTML streams from a URL (iframe src) so its bytes never enter the RSC
  // payload. Markdown/code are rendered server-side from `content`.
  contentSrc?: string | null;
  content?: string | null;
};

export async function ArtifactViewer({
  artifact,
  fullscreen,
}: {
  artifact: ArtifactRender;
  fullscreen?: boolean;
}) {
  if (artifact.type === "html")
    return <HtmlViewer src={artifact.contentSrc ?? ""} fullscreen={fullscreen} />;
  if (artifact.type === "markdown")
    return (
      <MarkdownViewer md={artifact.content ?? ""} fullscreen={fullscreen} />
    );
  return (
    <CodeViewer
      code={artifact.content ?? ""}
      language={artifact.language}
      fullscreen={fullscreen}
    />
  );
}

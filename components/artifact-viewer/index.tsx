import { HtmlViewer } from "./Html";
import { MarkdownViewer } from "./Markdown";
import { CodeViewer } from "./Code";

export type ArtifactRender = {
  type: "html" | "markdown" | "code";
  content: string;
  language?: string | null;
};

export async function ArtifactViewer({
  artifact,
  fullscreen,
}: {
  artifact: ArtifactRender;
  fullscreen?: boolean;
}) {
  if (artifact.type === "html")
    return <HtmlViewer html={artifact.content} fullscreen={fullscreen} />;
  if (artifact.type === "markdown")
    return <MarkdownViewer md={artifact.content} fullscreen={fullscreen} />;
  return (
    <CodeViewer
      code={artifact.content}
      language={artifact.language}
      fullscreen={fullscreen}
    />
  );
}

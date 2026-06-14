import { codeToHtml } from "shiki";
import { FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ThumbProps = {
  type: "html" | "markdown" | "code";
  // First few KB only — the full content is never loaded for the list.
  snippet: string | null;
  thumbKey: string | null;
  language?: string | null;
};

export async function ArtifactThumb({
  type,
  snippet,
  thumbKey,
  language,
}: ThumbProps) {
  if (type === "html") return <HtmlThumb thumbKey={thumbKey} />;
  if (type === "markdown") return <MarkdownThumb md={snippet ?? ""} />;
  return <CodeThumb code={snippet ?? ""} language={language ?? null} />;
}

/**
 * HTML preview. We never inline the (possibly multi-MB) markup into the list —
 * a pre-rendered PNG thumbnail is shown when available, otherwise a neutral
 * placeholder. This keeps the dashboard payload tiny regardless of artifact size.
 */
function HtmlThumb({ thumbKey }: { thumbKey: string | null }) {
  if (thumbKey) {
    return (
      <div className="absolute inset-0 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/artifacts/thumb/${thumbKey}`}
          alt="preview"
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 bg-card flex items-center justify-center">
      <FileCode2 className="size-8 text-muted-foreground/50" />
    </div>
  );
}

function MarkdownThumb({ md }: { md: string }) {
  const lines = md.split("\n").slice(0, 30);
  const title = lines.find((l) => l.startsWith("# "))?.replace(/^#\s+/, "");
  const body = lines
    .filter((l) => !l.startsWith("#") && l.trim())
    .slice(0, 4)
    .join(" ")
    .slice(0, 220);

  return (
    <div className="absolute inset-0 p-5 flex flex-col gap-2 bg-card">
      {title && (
        <div className="font-display font-bold text-base line-clamp-1 text-foreground">
          {title}
        </div>
      )}
      <div className="text-xs text-muted-foreground leading-relaxed line-clamp-6">
        {body || md.slice(0, 220)}
      </div>
      <div className="mt-auto flex gap-1">
        <span className="h-px w-12 bg-primary" />
        <span className="h-px w-6 bg-border-strong" />
      </div>
    </div>
  );
}

async function CodeThumb({
  code,
  language,
}: {
  code: string;
  language: string | null;
}) {
  const snippet = code.split("\n").slice(0, 14).join("\n");
  const lang = (language || "text").toLowerCase();
  // Shiki escapes input via codeToHtml — safe HTML output, same pattern used in components/artifact-viewer/Code.tsx.
  let html = "";
  try {
    html = await codeToHtml(snippet, {
      lang,
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    });
  } catch {
    const escaped = snippet
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    html = `<pre>${escaped}</pre>`;
  }
  return (
    <div className="absolute inset-0 bg-card overflow-hidden">
      <div
        className={cn(
          "absolute inset-0 p-4 text-[10px] leading-tight overflow-hidden",
          "[&_pre]:!bg-transparent [&_code]:font-mono",
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
    </div>
  );
}

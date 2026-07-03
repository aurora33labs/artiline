import { codeToHtml } from "shiki";
import { cn } from "@/lib/utils";

export async function CodeViewer({
  code,
  language,
  fullscreen,
}: {
  code: string;
  language?: string | null;
  fullscreen?: boolean;
}) {
  const lang = (language || "text").toLowerCase();
  // Shiki escapes input; the produced HTML is safe to inject.
  const html = await codeToHtml(code, {
    lang,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
  return (
    <div className="w-full px-5 sm:px-8 py-8 md:py-10">
      <div
        className={cn(
          "code-viewer mx-auto text-sm",
          fullscreen ? "max-w-5xl" : "max-w-4xl",
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

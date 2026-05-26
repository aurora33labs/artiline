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
    <div
      className={cn(
        "text-sm overflow-auto",
        fullscreen
          ? "max-w-5xl mx-auto px-4 py-8"
          : "rounded-md border p-4",
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

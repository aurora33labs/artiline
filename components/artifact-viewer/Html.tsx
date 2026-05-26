import { cn } from "@/lib/utils";

export function HtmlViewer({
  html,
  fullscreen,
}: {
  html: string;
  fullscreen?: boolean;
}) {
  return (
    <iframe
      srcDoc={html}
      sandbox="allow-scripts"
      className={cn(
        "bg-white",
        fullscreen
          ? "w-screen h-screen border-0"
          : "w-full h-[70vh] border rounded-md",
      )}
      title="artifact-html"
    />
  );
}

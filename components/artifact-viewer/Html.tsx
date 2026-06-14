import { cn } from "@/lib/utils";

export function HtmlViewer({
  src,
  fullscreen,
}: {
  src: string;
  fullscreen?: boolean;
}) {
  return (
    <iframe
      src={src}
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

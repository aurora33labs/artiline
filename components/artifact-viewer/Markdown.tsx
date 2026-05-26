import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { cn } from "@/lib/utils";

export function MarkdownViewer({
  md,
  fullscreen,
}: {
  md: string;
  fullscreen?: boolean;
}) {
  return (
    <div
      className={cn(
        "prose dark:prose-invert",
        fullscreen ? "max-w-3xl mx-auto px-6 py-12" : "max-w-none",
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
      >
        {md}
      </ReactMarkdown>
    </div>
  );
}

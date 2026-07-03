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
    <div className="w-full px-5 sm:px-8 py-12 md:py-16">
      <article
        className={cn(
          "markdown-body mx-auto",
          fullscreen ? "max-w-3xl" : "max-w-[46rem]",
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
        >
          {md}
        </ReactMarkdown>
      </article>
    </div>
  );
}

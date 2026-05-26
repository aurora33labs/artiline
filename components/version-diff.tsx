import { diffLines, type Change } from "diff";
import { cn } from "@/lib/utils";

export function VersionDiff({
  oldContent,
  newContent,
  oldLabel,
  newLabel,
}: {
  oldContent: string;
  newContent: string;
  oldLabel: string;
  newLabel: string;
}) {
  const changes: Change[] = diffLines(oldContent, newContent);

  return (
    <div className="border border-border bg-surface font-mono text-xs">
      <header className="grid grid-cols-2 border-b border-border">
        <div className="meta px-4 py-3 border-r border-border">{oldLabel}</div>
        <div className="meta px-4 py-3">{newLabel}</div>
      </header>
      <div className="overflow-auto max-h-[60vh]">
        {changes.map((change, i) => {
          const lines = change.value.split("\n");
          // diffLines preserves trailing newline as empty last element; drop it
          const display = lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
          if (display.length === 0) return null;

          if (change.added) {
            return (
              <pre
                key={i}
                className={cn(
                  "px-4 py-1 whitespace-pre-wrap bg-success/10 text-foreground border-l-2 border-success",
                )}
              >
                {display.map((l, j) => (
                  <span key={j} className="block">
                    <span className="text-success/70 mr-3 select-none">+</span>
                    {l}
                  </span>
                ))}
              </pre>
            );
          }
          if (change.removed) {
            return (
              <pre
                key={i}
                className={cn(
                  "px-4 py-1 whitespace-pre-wrap bg-destructive/10 text-foreground border-l-2 border-destructive",
                )}
              >
                {display.map((l, j) => (
                  <span key={j} className="block">
                    <span className="text-destructive/70 mr-3 select-none">−</span>
                    {l}
                  </span>
                ))}
              </pre>
            );
          }
          return (
            <pre
              key={i}
              className="px-4 py-1 whitespace-pre-wrap text-muted-foreground"
            >
              {display.map((l, j) => (
                <span key={j} className="block">
                  <span className="mr-3 select-none opacity-50"> </span>
                  {l}
                </span>
              ))}
            </pre>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import type { PendingSelection } from "@/components/annotation-provider";

interface SelectionTooltipProps {
  pendingSelection: PendingSelection;
  onAddComment: () => void;
  onDismiss: () => void;
}

export function SelectionTooltip({ pendingSelection, onAddComment, onDismiss }: SelectionTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    // Slight delay so the same mouseup that created the selection doesn't immediately dismiss
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 100);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [onDismiss]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onDismiss]);

  return (
    <div
      ref={ref}
      className="absolute z-50 pointer-events-auto"
      style={{ top: `calc(${pendingSelection.rectY * 100}% - 36px)`, right: 8 }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onAddComment(); }}
        className="flex items-center gap-1.5 rounded-md bg-foreground text-background px-2.5 py-1.5 text-xs font-medium shadow-lg hover:bg-foreground/90 transition-colors whitespace-nowrap"
      >
        <MessageSquare className="size-3" />
        Añadir comentario
      </button>
    </div>
  );
}

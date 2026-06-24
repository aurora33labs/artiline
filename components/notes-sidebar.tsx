"use client";

import { useState, useCallback } from "react";
import { MessageSquare, Pin, Globe, ChevronRight, Trash2, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { deleteAnnotation } from "@/app/actions/social";
import { useAnnotations, type Annotation } from "@/components/annotation-provider";

interface NotesSidebarProps {
  artifactId?: string;
  versionId?: string | null;
  artifactType?: "html" | "markdown" | "code";
  workspaceSlug?: string;
  slug?: string;
}

export function NotesSidebar({ }: NotesSidebarProps) {
  const tc = useTranslations("common");
  const tn = useTranslations("comments");
  const {
    annotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    setActiveCommentId,
    sidebarOpen,
    setSidebarOpen,
    removeAnnotation,
  } = useAnnotations();

  const [detailAnnotation, setDetailAnnotation] = useState<Annotation | null>(null);

  const handleDelete = useCallback(
    async (commentId: string) => {
      await deleteAnnotation(commentId);
      removeAnnotation(commentId);
      if (detailAnnotation?.commentId === commentId) setDetailAnnotation(null);
    },
    [removeAnnotation, detailAnnotation]
  );

  const targetIcon = (a: Annotation) => {
    if (a.targetType === "global") return <Globe className="size-3.5 text-muted-foreground" />;
    if (a.targetType === "text") return <Type className="size-3.5 text-primary" />;
    return <Pin className="size-3.5 text-primary" />;
  };

  return (
    <aside
      className={cn(
        "fixed right-0 top-0 h-full z-50 bg-surface/95 backdrop-blur-md border-l border-border",
        "transition-all duration-200 ease-in-out flex flex-col",
        sidebarOpen ? "w-80 md:w-96" : "w-0 overflow-hidden pointer-events-none"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <h2 className="font-display font-medium text-sm uppercase tracking-[0.06em]">
          {tn("modalTitle")}
          <span className="ml-1.5 text-muted-foreground">({annotations.length})</span>
        </h2>
        <button
          type="button"
          onClick={() => { setSidebarOpen(false); setDetailAnnotation(null); }}
          className="p-1 hover:bg-surface-2 rounded-sm transition-colors"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Detail view */}
      {detailAnnotation ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
            <button
              type="button"
              onClick={() => setDetailAnnotation(null)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              &larr; {tc("back")}
            </button>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {targetIcon(detailAnnotation)}
              {detailAnnotation.targetType === "text" && detailAnnotation.selectedText
                ? `"${detailAnnotation.selectedText.slice(0, 40)}${detailAnnotation.selectedText.length > 40 ? "…" : ""}"`
                : detailAnnotation.targetType === "global"
                ? "Nota global"
                : `(${Math.round(detailAnnotation.x * 100)}%, ${Math.round(detailAnnotation.y * 100)}%)`}
            </span>
            <button
              type="button"
              onClick={() => handleDelete(detailAnnotation.commentId)}
              className="ml-auto p-1 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">
                {detailAnnotation.userName ?? detailAnnotation.userEmail ?? detailAnnotation.authorName ?? tc("anonymous")}
              </span>
              <span>{new Date(detailAnnotation.createdAt).toLocaleString()}</span>
            </div>
            {detailAnnotation.selectedText && (
              <blockquote className="border-l-2 border-primary/40 pl-3 text-xs text-muted-foreground italic">
                &ldquo;{detailAnnotation.selectedText}&rdquo;
              </blockquote>
            )}
            <p className="text-sm whitespace-pre-wrap">{detailAnnotation.body}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {annotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground">
              <MessageSquare className="size-8 mb-2 opacity-40" />
              <p className="text-sm">{tn("noComments")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {annotations.map((annotation) => (
                <li
                  key={annotation.commentId}
                  className={cn(
                    "px-4 py-3 hover:bg-surface-2 cursor-pointer transition-colors",
                    selectedAnnotationId === annotation.commentId && "bg-surface-2"
                  )}
                  onClick={() => {
                    setDetailAnnotation(annotation);
                    setSelectedAnnotationId(annotation.commentId);
                    setActiveCommentId(annotation.commentId);
                  }}
                >
                  <div className="flex items-start gap-2">
                    <div className="shrink-0 mt-0.5">{targetIcon(annotation)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span className="truncate">
                          {annotation.userName ?? annotation.userEmail ?? annotation.authorName ?? tc("anonymous")}
                        </span>
                        <span className="shrink-0 ml-2">
                          {new Date(annotation.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {annotation.selectedText && (
                        <p className="text-[10px] text-muted-foreground/70 italic truncate mt-0.5 border-l-2 border-primary/30 pl-1.5">
                          &ldquo;{annotation.selectedText.slice(0, 50)}&rdquo;
                        </p>
                      )}
                      <p className="text-sm mt-1 line-clamp-2">{annotation.body}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}

"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { AnnotationProvider, useAnnotations, type PendingSelection } from "@/components/annotation-provider";
import { NoteMarker } from "@/components/note-marker";
import { NotesSidebar } from "@/components/notes-sidebar";
import { CommentMarginColumn } from "@/components/comment-margin-column";
import { addComment } from "@/app/actions/social";
import { cn } from "@/lib/utils";

export type AnnotationData = {
  id: string;
  commentId: string;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  targetType: "point" | "area" | "global" | "text";
  iframeX: number | null;
  iframeY: number | null;
  selectedText: string | null;
  anchorXPath: string | null;
  anchorOffset: number | null;
  anchorEndXPath: string | null;
  anchorEndOffset: number | null;
  body: string;
  authorName: string | null;
  userName: string | null;
  userEmail: string | null;
  createdAt: string;
};

function AnnotationInner({
  children,
  artifactId,
  versionId,
  artifactType,
  workspaceSlug,
  slug,
  initialAnnotations,
}: {
  children: React.ReactNode;
  artifactId: string;
  versionId?: string | null;
  artifactType: "html" | "markdown" | "code";
  workspaceSlug?: string;
  slug?: string;
  initialAnnotations: AnnotationData[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    annotations,
    setAnnotations,
    removeAnnotation,
    isPlacing,
    setIsPlacing,
    selectedAnnotationId,
    setSelectedAnnotationId,
    activeCommentId,
    setActiveCommentId,
    setCommentDraft,
  } = useAnnotations();

  const [containerHeight, setContainerHeight] = useState(0);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setAnnotations(initialAnnotations);
  }, [initialAnnotations, setAnnotations]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height);
    });
    ro.observe(containerRef.current);
    setContainerHeight(containerRef.current.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Cancel placing mode on Escape
  useEffect(() => {
    if (!isPlacing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsPlacing(false);
        setDragStart(null);
        setDragCurrent(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPlacing, setIsPlacing]);

  const toNorm = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const r = containerRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  }, []);

  const getLiveRect = (): PendingSelection | null => {
    if (!dragStart || !dragCurrent) return null;
    return {
      x: Math.min(dragStart.x, dragCurrent.x),
      y: Math.min(dragStart.y, dragCurrent.y),
      width: Math.abs(dragCurrent.x - dragStart.x),
      height: Math.abs(dragCurrent.y - dragStart.y),
    };
  };

  const handleConfirmComment = useCallback(async (body: string, draft: PendingSelection) => {
    const formData = new FormData();
    formData.set("artifactId", artifactId);
    if (versionId) formData.set("versionId", versionId);
    if (workspaceSlug) formData.set("workspaceSlug", workspaceSlug);
    if (slug) formData.set("slug", slug);
    formData.set("body", body);
    formData.set("x", String(draft.x));
    formData.set("y", String(draft.y));
    formData.set("width", String(draft.width));
    formData.set("height", String(draft.height));
    formData.set("targetType", "area");
    await addComment(formData);
  }, [artifactId, versionId, workspaceSlug, slug]);

  const liveRect = getLiveRect();

  return (
    <div className="w-full min-h-0">
      <div
        ref={containerRef}
        className="relative w-full"
        onClick={(e) => {
          // Deselect when clicking outside annotations
          if (!(e.target as HTMLElement).closest("[data-comment-id]")) {
            setActiveCommentId(null);
            setSelectedAnnotationId(null);
          }
        }}
      >
        {children}

        {/* Saved area rect overlays */}
        {annotations
          .filter((a) => a.targetType === "area" && a.width !== null && a.height !== null)
          .map((a) => (
            <div
              key={a.commentId}
              data-comment-id={a.commentId}
              className={cn(
                "absolute border-2 border-primary/50 bg-primary/10 cursor-pointer transition-colors hover:bg-primary/20",
                a.commentId === activeCommentId && "border-primary bg-primary/20 ring-2 ring-primary/30"
              )}
              style={{
                left: `${a.x * 100}%`,
                top: `${a.y * 100}%`,
                width: `${(a.width ?? 0.1) * 100}%`,
                height: `${(a.height ?? 0.1) * 100}%`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                setActiveCommentId(a.commentId);
                setSelectedAnnotationId(a.commentId);
              }}
            />
          ))}

        {/* NoteMarker for non-html point/area annotations */}
        {artifactType !== "html" &&
          annotations
            .filter((a) => a.targetType === "point")
            .map((a) => (
              <NoteMarker
                key={a.commentId}
                annotation={a}
                artifactType={artifactType}
                isActive={selectedAnnotationId === a.commentId}
                onClick={(commentId) => {
                  setSelectedAnnotationId(commentId);
                  setActiveCommentId(commentId);
                }}
              />
            ))}

        {/* Comment bubbles — overlaid on right edge, no reserved space */}
        <CommentMarginColumn
          annotations={annotations}
          containerHeight={containerHeight}
          activeCommentId={activeCommentId}
          onActivate={(id) => {
            setActiveCommentId(id);
            setSelectedAnnotationId(id);
          }}
          onConfirmComment={handleConfirmComment}
          onDelete={async (commentId) => { removeAnnotation(commentId); }}
          artifactId={artifactId}
          versionId={versionId}
          workspaceSlug={workspaceSlug}
          slug={slug}
        />

        {/* Drag-to-select overlay — active when isPlacing */}
        {isPlacing && (
          <div
            className="absolute inset-0 z-40 select-none"
            style={{ cursor: "crosshair" }}
            onMouseDown={(e) => {
              e.preventDefault();
              const p = toNorm(e);
              setDragStart(p);
              setDragCurrent(p);
            }}
            onMouseMove={(e) => {
              if (!dragStart) return;
              setDragCurrent(toNorm(e));
            }}
            onMouseUp={(e) => {
              if (!dragStart) return;
              const end = toNorm(e);
              const rect: PendingSelection = {
                x: Math.min(dragStart.x, end.x),
                y: Math.min(dragStart.y, end.y),
                width: Math.abs(end.x - dragStart.x),
                height: Math.abs(end.y - dragStart.y),
              };
              setDragStart(null);
              setDragCurrent(null);
              // Require a minimum size to avoid accidental clicks
              if (rect.width > 0.02 && rect.height > 0.02) {
                setCommentDraft(rect);
                setIsPlacing(false);
              }
            }}
          >
            {/* Hint banner */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-foreground/90 text-background text-xs font-medium pointer-events-none select-none whitespace-nowrap shadow-lg">
              Arrastra para seleccionar · Esc para cancelar
            </div>
            {/* Live drag rectangle */}
            {liveRect && liveRect.width > 0.005 && liveRect.height > 0.005 && (
              <div
                className="absolute border-2 border-primary bg-primary/15 pointer-events-none"
                style={{
                  left: `${liveRect.x * 100}%`,
                  top: `${liveRect.y * 100}%`,
                  width: `${liveRect.width * 100}%`,
                  height: `${liveRect.height * 100}%`,
                }}
              />
            )}
          </div>
        )}
      </div>
      <NotesSidebar />
    </div>
  );
}

export function AnnotationWrapper({
  children,
  artifactId,
  versionId,
  artifactType,
  workspaceSlug,
  slug,
  initialAnnotations,
}: {
  children: React.ReactNode;
  artifactId: string;
  versionId?: string | null;
  artifactType: "html" | "markdown" | "code";
  workspaceSlug?: string;
  slug?: string;
  initialAnnotations: AnnotationData[];
}) {
  return (
    <AnnotationProvider>
      <AnnotationInner
        artifactId={artifactId}
        versionId={versionId}
        artifactType={artifactType}
        workspaceSlug={workspaceSlug}
        slug={slug}
        initialAnnotations={initialAnnotations}
      >
        {children}
      </AnnotationInner>
    </AnnotationProvider>
  );
}

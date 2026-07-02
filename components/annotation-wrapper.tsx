"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { AnnotationProvider, useAnnotations, type PendingSelection } from "@/components/annotation-provider";
import { NoteMarker } from "@/components/note-marker";
import { NotesSidebar } from "@/components/notes-sidebar";
import { CommentMarginColumn } from "@/components/comment-margin-column";
import { addComment, toggleResolve } from "@/app/actions/social";
import { cn } from "@/lib/utils";

export type AnnotationData = {
  id: string;
  commentId: string;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  targetType: "point" | "area" | "global" | "text" | "element";
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
  resolved: boolean;
  replies: Array<{
    id: string;
    body: string;
    authorName: string | null;
    userName: string | null;
    userEmail: string | null;
    createdAt: string;
  }>;
};

// Generate XPath for a DOM element (client-side only)
function getXPath(el: Element): string {
  if (el.id) return `//*[@id="${el.id}"]`;
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement) {
    const tag = cur.tagName.toLowerCase();
    let idx = 1;
    let sib: Node | null = cur.previousSibling;
    while (sib) {
      if (sib.nodeType === 1 && (sib as Element).tagName === cur.tagName) idx++;
      sib = sib.previousSibling;
    }
    parts.unshift(`${tag}[${idx}]`);
    cur = cur.parentElement;
  }
  return `/html/${parts.join("/")}`;
}

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
  const ta = useTranslations("annotations");
  const containerRef = useRef<HTMLDivElement>(null);
  // Wraps only the artifact content — used for inspect-mode hit testing so that
  // app UI (dock, sidebar, overlays) is excluded from element selection.
  const contentRef = useRef<HTMLDivElement>(null);
  const {
    annotations,
    setAnnotations,
    updateAnnotation,
    removeAnnotation,
    isPlacing,
    setIsPlacing,
    isInspecting,
    setIsInspecting,
    selectedAnnotationId,
    setSelectedAnnotationId,
    activeCommentId,
    setActiveCommentId,
    setCommentDraft,
    commentDraft,
    pendingElementDraft,
    setPendingElementDraft,
    elementRects,
    setElementRects,
    htmlScrollMode,
  } = useAnnotations();

  // In HTML scroll-mode (viewport-unit artifact, iframe pinned to 100dvh) the
  // iframe scrolls internally, so page-absolute overlays computed from the
  // iframe's viewport-relative rects land in the wrong place and push the page
  // background into view. Hide the positioned overlays there; comments stay in
  // the sidebar.
  const suppressOverlays = artifactType === "html" && htmlScrollMode;

  const [containerHeight, setContainerHeight] = useState(0);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  // Hover highlight rect for markdown inspect mode (fixed position)
  const [hoverHighlight, setHoverHighlight] = useState<DOMRect | null>(null);

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

  // Live position tracking for element annotations (markdown/code — in-page DOM)
  useEffect(() => {
    if (artifactType === "html") return; // iframe handles its own tracking
    const elementAnnotations = annotations.filter(
      (a) => a.targetType === "element" && a.anchorXPath && !a.resolved
    );
    if (elementAnnotations.length === 0) return;

    const updateRects = () => {
      if (!containerRef.current) return;
      const cr = containerRef.current.getBoundingClientRect();
      const next: Record<string, { top: number; left: number; width: number; height: number }> = {};
      for (const a of elementAnnotations) {
        try {
          const result = document.evaluate(
            a.anchorXPath!,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          const el = result.singleNodeValue as Element | null;
          if (el) {
            const r = el.getBoundingClientRect();
            next[a.commentId] = {
              top: r.top - cr.top,
              left: r.left - cr.left,
              width: r.width,
              height: r.height,
            };
          }
        } catch {}
      }
      setElementRects((prev) => ({ ...prev, ...next }));
    };

    updateRects();
    const ro = new ResizeObserver(updateRects);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [annotations, artifactType, setElementRects]);

  // Scroll to annotation when activeCommentId changes
  useEffect(() => {
    if (!activeCommentId) return;
    const annotation = annotations.find((a) => a.commentId === activeCommentId);
    if (!annotation || !containerRef.current) return;

    let top: number;
    if (annotation.targetType === "element" && elementRects[activeCommentId]) {
      top = elementRects[activeCommentId].top;
    } else {
      const contentHeight = containerRef.current.offsetHeight;
      top = annotation.y * contentHeight;
    }

    let scroller: HTMLElement | null = containerRef.current.parentElement;
    while (scroller) {
      const oy = window.getComputedStyle(scroller).overflowY;
      if (oy === "auto" || oy === "scroll") break;
      scroller = scroller.parentElement;
    }
    const target = Math.max(0, top - window.innerHeight / 3);
    if (scroller) scroller.scrollTo({ top: target, behavior: "smooth" });
    else window.scrollTo({ top: target, behavior: "smooth" });
  }, [activeCommentId, elementRects]);

  // Cancel modes on Escape
  useEffect(() => {
    if (!isPlacing && !isInspecting && !pendingElementDraft) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsPlacing(false);
        setIsInspecting(false);
        setPendingElementDraft(null);
        setDragStart(null);
        setDragCurrent(null);
        setHoverHighlight(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPlacing, isInspecting, pendingElementDraft, setIsPlacing, setIsInspecting, setPendingElementDraft]);

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

  const handleConfirmElementComment = useCallback(async (body: string) => {
    if (!pendingElementDraft) return;
    const formData = new FormData();
    formData.set("artifactId", artifactId);
    if (versionId) formData.set("versionId", versionId);
    if (workspaceSlug) formData.set("workspaceSlug", workspaceSlug);
    if (slug) formData.set("slug", slug);
    formData.set("body", body);
    formData.set("targetType", "element");
    formData.set("anchorXPath", pendingElementDraft.xpath);
    formData.set("x", "0");
    const normalizedY = containerHeight > 0 ? pendingElementDraft.rect.top / containerHeight : 0;
    formData.set("y", String(Math.max(0, Math.min(1, normalizedY))));
    await addComment(formData);
    setPendingElementDraft(null);
  }, [pendingElementDraft, artifactId, versionId, workspaceSlug, slug, containerHeight, setPendingElementDraft]);

  const handleResolve = useCallback(async (commentId: string) => {
    const annotation = annotations.find((a) => a.commentId === commentId);
    if (!annotation) return;
    await toggleResolve(commentId);
    updateAnnotation(commentId, { resolved: !annotation.resolved });
  }, [annotations, updateAnnotation]);

  const liveRect = getLiveRect();

  return (
    <div className="w-full min-h-0">
      <div
        ref={containerRef}
        className="relative w-full"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("[data-comment-id]")) {
            setActiveCommentId(null);
            setSelectedAnnotationId(null);
          }
        }}
      >
        <div ref={contentRef}>{children}</div>

        {/* Area annotations are hidden — the mode was removed (fraction-based
            overlays de-anchor on iframe reflow). Text stays in the sidebar. */}

        {/* Element annotation outlines — unresolved only */}
        {!suppressOverlays &&
          annotations
          .filter((a) => a.targetType === "element" && !a.resolved && elementRects[a.commentId])
          .map((a) => {
            const r = elementRects[a.commentId];
            return (
              <div
                key={a.commentId}
                data-comment-id={a.commentId}
                className={cn(
                  "absolute pointer-events-auto border-2 border-primary/40 bg-primary/5 cursor-pointer transition-colors hover:bg-primary/15",
                  a.commentId === activeCommentId && "border-primary bg-primary/15 ring-2 ring-primary/30"
                )}
                style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveCommentId(a.commentId);
                  setSelectedAnnotationId(a.commentId);
                }}
              />
            );
          })}

        {/* Pending element draft outline */}
        {pendingElementDraft && !suppressOverlays && (
          <div
            className="absolute pointer-events-none border-2 border-primary bg-primary/10 z-30"
            style={{
              top: pendingElementDraft.rect.top,
              left: pendingElementDraft.rect.left,
              width: pendingElementDraft.rect.width,
              height: pendingElementDraft.rect.height,
            }}
          />
        )}

        {/* NoteMarker for non-html point annotations */}
        {artifactType !== "html" &&
          annotations
            .filter((a) => a.targetType === "point" && !a.resolved)
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

        {/* Comment bubbles overlay — suppressed in HTML scroll-mode (positions
            can't be mapped; comments remain in the sidebar) */}
        {!suppressOverlays && (
        <CommentMarginColumn
          annotations={annotations}
          containerHeight={containerHeight}
          activeCommentId={activeCommentId}
          onActivate={(id) => {
            setActiveCommentId(id);
            setSelectedAnnotationId(id);
          }}
          onConfirmComment={handleConfirmComment}
          onConfirmElementComment={handleConfirmElementComment}
          onDelete={async (commentId) => { removeAnnotation(commentId); }}
          onResolve={handleResolve}
          artifactId={artifactId}
          versionId={versionId}
          workspaceSlug={workspaceSlug}
          slug={slug}
        />
        )}

        {/* Drag-to-select overlay */}
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
              if (rect.width > 0.02 && rect.height > 0.02) {
                setCommentDraft(rect);
                setIsPlacing(false);
              }
            }}
          >
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-foreground/90 text-background text-xs font-medium pointer-events-none select-none whitespace-nowrap shadow-lg">
              {ta("dragHint")}
            </div>
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

        {/* Inspect mode overlay — for markdown/code (in-page DOM) */}
        {isInspecting && artifactType !== "html" && (
          <div
            className="absolute inset-0 z-40 select-none"
            style={{ cursor: "crosshair" }}
            onMouseMove={(e) => {
              const el = e.currentTarget;
              (el as HTMLElement).style.pointerEvents = "none";
              const target = document.elementFromPoint(e.clientX, e.clientY);
              (el as HTMLElement).style.pointerEvents = "auto";
              if (target && target !== el && contentRef.current?.contains(target)) {
                setHoverHighlight(target.getBoundingClientRect());
              } else {
                setHoverHighlight(null);
              }
            }}
            onMouseLeave={() => setHoverHighlight(null)}
            onClick={(e) => {
              const el = e.currentTarget;
              (el as HTMLElement).style.pointerEvents = "none";
              const target = document.elementFromPoint(e.clientX, e.clientY);
              (el as HTMLElement).style.pointerEvents = "auto";
              if (!target || !contentRef.current?.contains(target)) return;
              const xpath = getXPath(target);
              const targetRect = target.getBoundingClientRect();
              const cr = containerRef.current!.getBoundingClientRect();
              setPendingElementDraft({
                xpath,
                rect: {
                  top: targetRect.top - cr.top,
                  left: targetRect.left - cr.left,
                  width: targetRect.width,
                  height: targetRect.height,
                },
              });
              setIsInspecting(false);
              setHoverHighlight(null);
            }}
          >
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-foreground/90 text-background text-xs font-medium pointer-events-none select-none whitespace-nowrap shadow-lg">
              {ta("inspectHint")}
            </div>
          </div>
        )}

        {/* Hover highlight for in-page inspect mode (fixed position) */}
        {hoverHighlight && isInspecting && artifactType !== "html" && (
          <div
            className="fixed pointer-events-none z-50 border-2 border-primary/70 bg-primary/10"
            style={{
              top: hoverHighlight.top,
              left: hoverHighlight.left,
              width: hoverHighlight.width,
              height: hoverHighlight.height,
            }}
          />
        )}
      </div>
      <NotesSidebar
        artifactId={artifactId}
        versionId={versionId}
        workspaceSlug={workspaceSlug}
        slug={slug}
      />
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

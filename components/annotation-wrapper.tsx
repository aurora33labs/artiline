"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { AnnotationProvider, useAnnotations, type PendingSelection } from "@/components/annotation-provider";
import { NoteMarker } from "@/components/note-marker";
import { NotesSidebar } from "@/components/notes-sidebar";
import { CommentMarginColumn } from "@/components/comment-margin-column";
import { addComment } from "@/app/actions/social";

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

function getXPath(node: Node | null): string {
  if (!node) return "";
  if (node.nodeType === Node.TEXT_NODE) {
    let idx = 0;
    let sib = node.parentNode?.firstChild ?? null;
    while (sib) {
      if (sib === node) break;
      if (sib.nodeType === Node.TEXT_NODE) idx++;
      sib = sib.nextSibling;
    }
    return getXPath(node.parentNode) + `/text()[${idx}]`;
  }
  const el = node as Element;
  if (el === document.documentElement) return "/html";
  if (!el.parentNode) return "";
  const tag = el.tagName.toLowerCase();
  let idx = 1;
  let sib = el.parentNode.firstChild;
  while (sib) {
    if (sib === el) break;
    if (sib.nodeType === Node.ELEMENT_NODE && (sib as Element).tagName === el.tagName) idx++;
    sib = sib.nextSibling;
  }
  return getXPath(el.parentNode) + `/${tag}[${idx}]`;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
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
    pendingSelection,
    setPendingSelection,
  } = useAnnotations();
  const [placingCoords, setPlacingCoords] = useState<{ x: number; y: number } | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    setAnnotations(initialAnnotations);
  }, [initialAnnotations, setAnnotations]);

  // Track container height for bubble positioning
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height);
    });
    ro.observe(containerRef.current);
    setContainerHeight(containerRef.current.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Find the iframe element after render
  useEffect(() => {
    if (artifactType !== "html") return;
    const iframe = containerRef.current?.querySelector("iframe");
    if (iframe) iframeRef.current = iframe as HTMLIFrameElement;
  });

  // Sync highlights to iframe when annotations or activeCommentId change
  useEffect(() => {
    if (artifactType !== "html") return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const textAnnotations = annotations
      .filter((a) => a.targetType === "text" && a.anchorXPath)
      .map((a) => ({
        commentId: a.commentId,
        anchorXPath: a.anchorXPath,
        anchorOffset: a.anchorOffset ?? 0,
        anchorEndXPath: a.anchorEndXPath,
        anchorEndOffset: a.anchorEndOffset ?? 0,
        active: a.commentId === activeCommentId,
      }));
    // Target "*": the sandboxed iframe has a null/opaque origin so a specific
    // targetOrigin would silently drop the message.
    iframe.contentWindow.postMessage({ type: "HIGHLIGHT_ANNOTATIONS", annotations: textAnnotations }, "*");
  }, [annotations, activeCommentId, artifactType]);

  // postMessage listener for iframe events
  useEffect(() => {
    if (artifactType !== "html") return;

    const handler = (event: MessageEvent) => {
      // The raw artifact route serves with CSP `sandbox allow-scripts`, which
      // gives the iframe document a null/opaque origin — event.origin is the
      // string "null", not window.location.origin. Checking event.source is
      // the reliable guard: it must come from our specific iframe window.
      if (!iframeRef.current) return;
      if (event.source !== iframeRef.current.contentWindow) return;
      if (!event.data || typeof event.data !== "object") return;

      if (event.data.type === "TEXT_SELECTION") {
        setPendingSelection({
          selectedText: event.data.selectedText,
          anchorXPath: event.data.anchorXPath,
          anchorOffset: event.data.anchorOffset,
          anchorEndXPath: event.data.anchorEndXPath,
          anchorEndOffset: event.data.anchorEndOffset,
          rectY: event.data.rectY,
          rectX: event.data.rectX,
        });
        return;
      }
      if (event.data.type === "SELECTION_CLEARED") {
        setPendingSelection(null);
        return;
      }
      if (event.data.type === "ANNOTATION_CLICK" && isPlacing) {
        setPlacingCoords({ x: event.data.x, y: event.data.y });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [artifactType, isPlacing, setPendingSelection]);

  // Handle placing design-click annotation
  useEffect(() => {
    if (!placingCoords || !isPlacing) return;
    const { x, y } = placingCoords;

    const formData = new FormData();
    formData.set("artifactId", artifactId);
    if (versionId) formData.set("versionId", versionId);
    if (workspaceSlug) formData.set("workspaceSlug", workspaceSlug);
    if (slug) formData.set("slug", slug);
    formData.set("body", "Click to edit this note");
    formData.set("x", String(x));
    formData.set("y", String(y));
    formData.set("targetType", "point");
    if (artifactType === "html") {
      formData.set("iframeX", String(x));
      formData.set("iframeY", String(y));
    }

    addComment(formData).then(() => {
      setIsPlacing(false);
      setPlacingCoords(null);
    }).catch(() => {
      setIsPlacing(false);
      setPlacingCoords(null);
    });
  }, [placingCoords, isPlacing, artifactId, versionId, workspaceSlug, slug, artifactType, setIsPlacing]);

  // mouseup handler for non-iframe artifacts (markdown/code text selection)
  const handleMouseUp = useCallback(() => {
    if (artifactType === "html") return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.toString().trim()) {
      setPendingSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    setPendingSelection({
      selectedText: sel.toString(),
      anchorXPath: getXPath(sel.anchorNode),
      anchorOffset: sel.anchorOffset,
      anchorEndXPath: getXPath(sel.focusNode),
      anchorEndOffset: sel.focusOffset,
      rectY: (rect.top - containerRect.top) / containerRect.height,
      rectX: (rect.left - containerRect.left) / containerRect.width,
    });
  }, [artifactType, setPendingSelection]);

  // Click handler for markdown/code design-click
  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isPlacing || artifactType === "html") return;
      if (!containerRef.current) return;
      const sel = window.getSelection();
      if (sel && sel.toString().trim()) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setPlacingCoords({ x, y });
    },
    [isPlacing, artifactType]
  );

  const handleConfirmComment = useCallback(async (body: string, selection: PendingSelection) => {
    const formData = new FormData();
    formData.set("artifactId", artifactId);
    if (versionId) formData.set("versionId", versionId);
    if (workspaceSlug) formData.set("workspaceSlug", workspaceSlug);
    if (slug) formData.set("slug", slug);
    formData.set("body", body);
    formData.set("x", String(selection.rectX));
    formData.set("y", String(selection.rectY));
    formData.set("targetType", "text");
    formData.set("selectedText", selection.selectedText);
    formData.set("anchorXPath", selection.anchorXPath);
    formData.set("anchorOffset", String(selection.anchorOffset));
    formData.set("anchorEndXPath", selection.anchorEndXPath);
    formData.set("anchorEndOffset", String(selection.anchorEndOffset));
    if (artifactType === "html") {
      formData.set("iframeX", String(selection.rectX));
      formData.set("iframeY", String(selection.rectY));
    }
    await addComment(formData);
    setPendingSelection(null);
  }, [artifactId, versionId, workspaceSlug, slug, artifactType, setPendingSelection]);

  const renderMarkers = () => {
    if (artifactType === "html") return null;
    return annotations
      .filter((a) => a.targetType === "point" || a.targetType === "area")
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
      ));
  };

  return (
    <div className="flex w-full min-h-0">
      <div
        ref={containerRef}
        className="relative flex-1 min-w-0"
        onClick={handleContainerClick}
        onMouseUp={handleMouseUp}
        style={isPlacing && artifactType !== "html" ? { cursor: "crosshair" } : undefined}
      >
        {children}
        {renderMarkers()}
      </div>
      <CommentMarginColumn
        annotations={annotations}
        containerHeight={containerHeight}
        activeCommentId={activeCommentId}
        onActivate={(id) => {
          setActiveCommentId(id);
          if (id && artifactType === "html" && iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({ type: "ACTIVATE_ANNOTATION", commentId: id }, "*");
          }
        }}
        pendingSelection={pendingSelection}
        onConfirmComment={handleConfirmComment}
        onDismissPending={() => setPendingSelection(null)}
        onDelete={async (commentId) => { removeAnnotation(commentId); }}
        artifactId={artifactId}
        versionId={versionId}
        workspaceSlug={workspaceSlug}
        slug={slug}
      />
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

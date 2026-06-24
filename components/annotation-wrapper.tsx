"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { AnnotationProvider, useAnnotations } from "@/components/annotation-provider";
import { NotesSidebar } from "@/components/notes-sidebar";
import { NoteMarker } from "@/components/note-marker";
import { addComment } from "@/app/actions/social";

export type AnnotationData = {
  id: string;
  commentId: string;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  targetType: "point" | "area" | "global";
  iframeX: number | null;
  iframeY: number | null;
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
    setAnnotations,
    isPlacing,
    setIsPlacing,
    selectedAnnotationId,
    setSelectedAnnotationId,
  } = useAnnotations();
  const [placingCoords, setPlacingCoords] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setAnnotations(initialAnnotations);
  }, [initialAnnotations, setAnnotations]);

  // postMessage listener for iframe (HTML/React) clicks
  useEffect(() => {
    if (artifactType !== "html") return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "ANNOTATION_CLICK") return;
      if (!isPlacing) return;

      const { x, y } = event.data;
      setPlacingCoords({ x, y });
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [artifactType, isPlacing]);

  // Handle placing annotation when coordinates are ready
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
    formData.set("targetType", artifactType === "html" ? "point" : "point");
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

  // Click handler for Markdown/Code content to place annotations
  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isPlacing || artifactType === "html") return;
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      setPlacingCoords({ x, y });
    },
    [isPlacing, artifactType]
  );

  // Render markers for non-html (Markdown/Code)
  const renderMarkers = () => {
    if (artifactType === "html") return null;
    return initialAnnotations.map((a) => (
      <NoteMarker
        key={a.commentId}
        annotation={a}
        artifactType={artifactType}
        isActive={selectedAnnotationId === a.commentId}
        onClick={(commentId) => setSelectedAnnotationId(commentId)}
      />
    ));
  };

  return (
    <>
      <div
        ref={containerRef}
        className="relative"
        onClick={handleContainerClick}
        style={isPlacing && artifactType !== "html" ? { cursor: "crosshair" } : undefined}
      >
        {children}
        {renderMarkers()}
        {isPlacing && artifactType === "html" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="bg-primary/10 border-2 border-primary border-dashed rounded-lg px-6 py-3 text-sm text-primary font-medium">
              Click inside the preview to place a note
            </div>
          </div>
        )}
      </div>
      <NotesSidebar
        artifactId={artifactId}
        versionId={versionId}
        artifactType={artifactType}
        workspaceSlug={workspaceSlug}
        slug={slug}
      />
    </>
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

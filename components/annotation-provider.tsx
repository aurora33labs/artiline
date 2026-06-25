"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

export type Reply = {
  id: string;
  body: string;
  authorName: string | null;
  userName: string | null;
  userEmail: string | null;
  createdAt: string;
};

export type Annotation = {
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
  replies: Reply[];
};

// Normalized rect (all 0-1) for a dragged area selection
export type PendingSelection = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// Pending element annotation (xpath + pixel rect relative to container)
export type PendingElementDraft = {
  xpath: string;
  rect: { top: number; left: number; width: number; height: number };
};

// Pixel rect for a live-tracked element annotation
export type ElementRect = { top: number; left: number; width: number; height: number };

type AnnotationContextType = {
  annotations: Annotation[];
  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (commentId: string, updates: Partial<Annotation>) => void;
  removeAnnotation: (commentId: string) => void;
  selectedAnnotationId: string | null;
  setSelectedAnnotationId: (id: string | null) => void;
  activeCommentId: string | null;
  setActiveCommentId: (id: string | null) => void;
  commentDraft: PendingSelection | null;
  setCommentDraft: (s: PendingSelection | null) => void;
  isPlacing: boolean;
  setIsPlacing: (placing: boolean) => void;
  isInspecting: boolean;
  setIsInspecting: (v: boolean) => void;
  pendingElementDraft: PendingElementDraft | null;
  setPendingElementDraft: (d: PendingElementDraft | null) => void;
  elementRects: Record<string, ElementRect>;
  setElementRects: React.Dispatch<React.SetStateAction<Record<string, ElementRect>>>;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
};

const AnnotationContext = createContext<AnnotationContextType | null>(null);

export function AnnotationProvider({ children }: { children: ReactNode }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState<PendingSelection | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [pendingElementDraft, setPendingElementDraft] = useState<PendingElementDraft | null>(null);
  const [elementRects, setElementRects] = useState<Record<string, ElementRect>>({});
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = sessionStorage.getItem("annotationsSidebarOpen");
    return stored !== null ? (JSON.parse(stored) as boolean) : false;
  });

  useEffect(() => {
    sessionStorage.setItem("annotationsSidebarOpen", JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);

  const addAnnotation = useCallback((annotation: Annotation) => {
    setAnnotations((prev) => [...prev, annotation]);
  }, []);

  const updateAnnotation = useCallback((commentId: string, updates: Partial<Annotation>) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.commentId === commentId ? { ...a, ...updates } : a))
    );
  }, []);

  const removeAnnotation = useCallback((commentId: string) => {
    setAnnotations((prev) => prev.filter((a) => a.commentId !== commentId));
    if (selectedAnnotationId === commentId) setSelectedAnnotationId(null);
    if (activeCommentId === commentId) setActiveCommentId(null);
  }, [selectedAnnotationId, activeCommentId]);

  return (
    <AnnotationContext.Provider
      value={{
        annotations,
        setAnnotations,
        addAnnotation,
        updateAnnotation,
        removeAnnotation,
        selectedAnnotationId,
        setSelectedAnnotationId,
        activeCommentId,
        setActiveCommentId,
        commentDraft,
        setCommentDraft,
        isPlacing,
        setIsPlacing,
        isInspecting,
        setIsInspecting,
        pendingElementDraft,
        setPendingElementDraft,
        elementRects,
        setElementRects,
        sidebarOpen,
        setSidebarOpen,
      }}
    >
      {children}
    </AnnotationContext.Provider>
  );
}

export function useAnnotations() {
  const context = useContext(AnnotationContext);
  if (!context) {
    throw new Error("useAnnotations must be used within an AnnotationProvider");
  }
  return context;
}

// Safe version — returns null if used outside AnnotationProvider (e.g. HtmlViewer in preview)
export function useAnnotationsOptional() {
  return useContext(AnnotationContext);
}

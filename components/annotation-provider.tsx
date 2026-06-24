"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

export type Annotation = {
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

// Normalized rect (all 0-1) for a dragged area selection
export type PendingSelection = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("annotationsSidebarOpen");
    if (stored !== null) setSidebarOpen(JSON.parse(stored));
  }, []);

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

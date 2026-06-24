"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

export type Annotation = {
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

type AnnotationContextType = {
  annotations: Annotation[];
  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (commentId: string, updates: Partial<Annotation>) => void;
  removeAnnotation: (commentId: string) => void;
  selectedAnnotationId: string | null;
  setSelectedAnnotationId: (id: string | null) => void;
  isPlacing: boolean;
  setIsPlacing: (placing: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
};

const AnnotationContext = createContext<AnnotationContextType | null>(null);

export function AnnotationProvider({ children }: { children: ReactNode }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = sessionStorage.getItem("annotationsSidebarOpen");
    return stored !== null ? JSON.parse(stored) : false;
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
    if (selectedAnnotationId === commentId) {
      setSelectedAnnotationId(null);
    }
  }, [selectedAnnotationId]);

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
"use client";

import { useState, useCallback, useRef } from "react";
import {
  MessageSquare,
  Pin,
  Globe,
  Plus,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { addComment, deleteAnnotation } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAnnotations, type Annotation } from "@/components/annotation-provider";

interface NotesSidebarProps {
  artifactId: string;
  versionId?: string | null;
  artifactType: "html" | "markdown" | "code";
  workspaceSlug?: string;
  slug?: string;
}

export function NotesSidebar({
  artifactId,
  versionId,
  artifactType,
  workspaceSlug,
  slug,
}: NotesSidebarProps) {
  const t = useTranslations("viewer");
  const tc = useTranslations("common");
  const tn = useTranslations("comments");
  const {
    annotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    isPlacing,
    setIsPlacing,
    sidebarOpen,
    setSidebarOpen,
    removeAnnotation,
  } = useAnnotations();

  const [newNoteBody, setNewNoteBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detailAnnotation, setDetailAnnotation] = useState<Annotation | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = useCallback(
    async (formData: FormData) => {
      setIsSubmitting(true);
      try {
        formData.set("artifactId", artifactId);
        if (versionId) formData.set("versionId", versionId);
        if (workspaceSlug) formData.set("workspaceSlug", workspaceSlug);
        if (slug) formData.set("slug", slug);
        formData.set("targetType", "global");
        await addComment(formData);
        setNewNoteBody("");
        setIsPlacing(false);
      } catch {
        // handled by the server action
      } finally {
        setIsSubmitting(false);
      }
    },
    [artifactId, versionId, workspaceSlug, slug, setIsPlacing]
  );

  const handleDelete = useCallback(
    async (commentId: string) => {
      await deleteAnnotation(commentId);
      removeAnnotation(commentId);
      if (detailAnnotation?.commentId === commentId) {
        setDetailAnnotation(null);
      }
    },
    [removeAnnotation, detailAnnotation]
  );

  const isIframe = artifactType === "html";

  return (
    <>
      {/* Collapsed toggle button when sidebar is closed */}
      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className={cn(
            "fixed right-0 top-1/2 -translate-y-1/2 z-40",
            "bg-surface/95 backdrop-blur-md border border-border rounded-l-md p-2",
            "hover:bg-surface-2 transition-colors"
          )}
          aria-label={t("comments")}
        >
          <MessageSquare className="size-5" />
          {annotations.length > 0 && (
            <span className="absolute -top-1 -right-1 size-4 rounded-xs bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center font-display">
              {annotations.length > 99 ? "99+" : annotations.length}
            </span>
          )}
        </button>
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          "fixed right-0 top-0 h-full z-50 bg-surface/95 backdrop-blur-md border-l border-border",
          "transition-all duration-200 ease-in-out flex flex-col",
          sidebarOpen ? "w-80 md:w-96" : "w-0 overflow-hidden"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
          <h2 className="font-display font-medium text-sm uppercase tracking-[0.06em]">
            {tn("modalTitle")}
            <span className="ml-1.5 text-muted-foreground">
              ({annotations.length})
            </span>
          </h2>
          <button
            type="button"
            onClick={() => {
              setSidebarOpen(false);
              setDetailAnnotation(null);
            }}
            className="p-1 hover:bg-surface-2 rounded-sm transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* Detail panel or notes list */}
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
              <span className="text-xs text-muted-foreground">
                {detailAnnotation.targetType === "global" ? (
                  <Globe className="size-3 inline mr-1" />
                ) : (
                  <Pin className="size-3 inline mr-1" />
                )}
                {detailAnnotation.targetType === "global"
                  ? "Global note"
                  : `Position (${Math.round(detailAnnotation.x * 100)}%, ${Math.round(detailAnnotation.y * 100)}%)`}
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
                  {detailAnnotation.userName ??
                    detailAnnotation.userEmail ??
                    detailAnnotation.authorName ??
                    tc("anonymous")}
                </span>
                <span>
                  {new Date(detailAnnotation.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{detailAnnotation.body}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Notes list */}
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
                        selectedAnnotationId === annotation.commentId &&
                          "bg-surface-2"
                      )}
                      onClick={() => {
                        setDetailAnnotation(annotation);
                        setSelectedAnnotationId(annotation.commentId);
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <div className="shrink-0 mt-0.5">
                          {annotation.targetType === "global" ? (
                            <Globe className="size-3.5 text-muted-foreground" />
                          ) : (
                            <Pin className="size-3.5 text-primary" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span className="truncate">
                              {annotation.userName ??
                                annotation.userEmail ??
                                annotation.authorName ??
                                tc("anonymous")}
                            </span>
                            <span className="shrink-0 ml-2">
                              {new Date(annotation.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm mt-1 line-clamp-2">
                            {annotation.body}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Add note form */}
            <div className="border-t border-border p-4 shrink-0">
              {isPlacing ? (
                <div className="text-xs text-muted-foreground mb-2">
                  {isIframe
                    ? "Click inside the preview to place a note"
                    : "Click anywhere on the content to place a note"}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsPlacing(true);
                    if (isIframe) {
                      setNewNoteBody("");
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm",
                    "border border-dashed border-border rounded-md",
                    "text-muted-foreground hover:text-foreground hover:border-border-strong",
                    "transition-colors"
                  )}
                >
                  <Plus className="size-4" />
                  {tn("addComment")}
                </button>
              )}

              {isPlacing && (
                <form
                  ref={formRef}
                  action={handleSubmit}
                  className="space-y-2 mt-2"
                >
                  <Textarea
                    name="body"
                    value={newNoteBody}
                    onChange={(e) => setNewNoteBody(e.target.value)}
                    placeholder={tn("commentPlaceholder")}
                    required
                    rows={3}
                    maxLength={2000}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isSubmitting || !newNoteBody.trim()}
                    >
                      {tn("submit")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsPlacing(false);
                        setNewNoteBody("");
                      }}
                    >
                      {tc("cancel")}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

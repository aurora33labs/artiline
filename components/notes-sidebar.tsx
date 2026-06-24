"use client";

import { useState, useCallback } from "react";
import { MessageSquare, Pin, Globe, ChevronRight, ChevronDown, Trash2, Type, PlusCircle, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { deleteComment, addComment, addReply, toggleResolve } from "@/app/actions/social";
import { useAnnotations, type Annotation } from "@/components/annotation-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface NotesSidebarProps {
  artifactId?: string;
  versionId?: string | null;
  artifactType?: "html" | "markdown" | "code";
  workspaceSlug?: string;
  slug?: string;
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export function NotesSidebar({ artifactId, versionId, workspaceSlug, slug }: NotesSidebarProps) {
  const tc = useTranslations("common");
  const tn = useTranslations("comments");
  const {
    annotations,
    setAnnotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    setActiveCommentId,
    sidebarOpen,
    setSidebarOpen,
    removeAnnotation,
  } = useAnnotations();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [globalDraftOpen, setGlobalDraftOpen] = useState(false);
  const [globalDraftBody, setGlobalDraftBody] = useState("");
  const [isSubmittingGlobal, setIsSubmittingGlobal] = useState(false);
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const handleDelete = useCallback(
    async (commentId: string) => {
      await deleteComment(commentId);
      removeAnnotation(commentId);
      if (expandedId === commentId) setExpandedId(null);
      setPendingDeleteId(null);
    },
    [removeAnnotation, expandedId]
  );

  const handleResolve = useCallback(
    async (commentId: string) => {
      await toggleResolve(commentId);
      setAnnotations(annotations.map((a) =>
        a.commentId === commentId ? { ...a, resolved: !a.resolved } : a
      ));
    },
    [annotations, setAnnotations]
  );

  const handleGlobalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalDraftBody.trim() || !artifactId) return;
    setIsSubmittingGlobal(true);
    try {
      const fd = new FormData();
      fd.set("artifactId", artifactId);
      if (versionId) fd.set("versionId", versionId);
      if (workspaceSlug) fd.set("workspaceSlug", workspaceSlug);
      if (slug) fd.set("slug", slug);
      fd.set("body", globalDraftBody.trim());
      fd.set("targetType", "global");
      await addComment(fd);
      setGlobalDraftBody("");
      setGlobalDraftOpen(false);
    } finally {
      setIsSubmittingGlobal(false);
    }
  };

  const handleReplySubmit = async (e: React.FormEvent, commentId: string) => {
    e.preventDefault();
    const body = replyBodies[commentId]?.trim();
    if (!body || !artifactId) return;
    setReplyingId(commentId);
    try {
      const fd = new FormData();
      fd.set("parentCommentId", commentId);
      fd.set("body", body);
      fd.set("artifactId", artifactId);
      if (workspaceSlug) fd.set("workspaceSlug", workspaceSlug);
      if (slug) fd.set("slug", slug);
      await addReply(fd);
      setReplyBodies((prev) => ({ ...prev, [commentId]: "" }));
    } finally {
      setReplyingId(null);
    }
  };

  const targetIcon = (a: Annotation) => {
    if (a.targetType === "global") return <Globe className="size-3.5 text-muted-foreground" />;
    if (a.targetType === "text") return <Type className="size-3.5 text-primary" />;
    return <Pin className="size-3.5 text-primary" />;
  };

  const open = annotations.filter((a) => !a.resolved);
  const resolved = annotations.filter((a) => a.resolved);

  const renderAnnotationRow = (annotation: Annotation, isResolvedSection = false) => {
    const isExpanded = expandedId === annotation.commentId;
    const isPendingDelete = pendingDeleteId === annotation.commentId;

    return (
      <li
        key={annotation.commentId}
        className={cn(
          "px-4 py-3 hover:bg-surface-2 transition-colors",
          selectedAnnotationId === annotation.commentId && "bg-surface-2",
          isResolvedSection && "opacity-60"
        )}
      >
        <div
          className="flex items-start gap-2 cursor-pointer"
          onClick={() => {
            if (isPendingDelete) { setPendingDeleteId(null); return; }
            const next = isExpanded ? null : annotation.commentId;
            setExpandedId(next);
            setSelectedAnnotationId(annotation.commentId);
            if (!isResolvedSection) setActiveCommentId(annotation.commentId);
          }}
        >
          <div className="shrink-0 mt-0.5">{targetIcon(annotation)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-base text-muted-foreground">
              <span className="truncate">
                {annotation.userName ?? annotation.userEmail ?? annotation.authorName ?? tc("anonymous")}
              </span>
              <span className="shrink-0 ml-2">
                {new Date(annotation.createdAt).toLocaleDateString()}
              </span>
            </div>
            {annotation.selectedText && (
              <p className="text-base text-muted-foreground/70 italic truncate mt-0.5 border-l-2 border-primary/30 pl-1.5">
                &ldquo;{annotation.selectedText.slice(0, 50)}&rdquo;
              </p>
            )}
            <p className={cn("text-base mt-1 line-clamp-2", isResolvedSection && "line-through decoration-muted-foreground/40")}>
              {annotation.body}
            </p>
            {annotation.replies.length > 0 && !isExpanded && (
              <p className="text-base text-muted-foreground mt-1 flex items-center gap-1">
                <MessageSquare className="size-3" />
                {annotation.replies.length} {annotation.replies.length === 1 ? "respuesta" : "respuestas"}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="shrink-0 flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            {/* Resolve / Re-open */}
            {isResolvedSection ? (
              <button
                type="button"
                onClick={() => handleResolve(annotation.commentId)}
                className="p-1 text-green-500 hover:text-muted-foreground transition-colors rounded"
                title="Re-abrir"
              >
                <RotateCcw className="size-3" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleResolve(annotation.commentId)}
                className="p-1 text-green-600/60 hover:text-green-500 transition-colors rounded"
                title="Marcar resuelto"
              >
                <Check className="size-4" />
              </button>
            )}

            {/* Delete: primer clic abre strip de confirmación al fondo */}
            <button
              type="button"
              onClick={() => setPendingDeleteId(annotation.commentId)}
              className="p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors rounded"
              title="Eliminar"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Inline thread */}
        {isExpanded && (
          <div className="mt-3 pl-5 space-y-3">
            {annotation.replies.map((reply) => (
              <div key={reply.id} className="flex gap-2">
                <div className="size-5 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-bold font-display">
                  {getInitials(reply.userName ?? reply.authorName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-base text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {reply.userName ?? reply.authorName ?? tc("anonymous")}
                    </span>
                    <span>{new Date(reply.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-base mt-0.5 text-muted-foreground">{reply.body}</p>
                </div>
              </div>
            ))}

            {artifactId && !isResolvedSection && (
              <form
                onSubmit={(e) => handleReplySubmit(e, annotation.commentId)}
                className="flex items-center gap-2 pt-1"
              >
                <input
                  value={replyBodies[annotation.commentId] ?? ""}
                  onChange={(e) =>
                    setReplyBodies((prev) => ({ ...prev, [annotation.commentId]: e.target.value }))
                  }
                  placeholder="Responder..."
                  maxLength={500}
                  className="flex-1 text-base bg-transparent border-b border-border outline-none placeholder:text-muted-foreground py-1"
                />
                <button
                  type="submit"
                  disabled={!replyBodies[annotation.commentId]?.trim() || replyingId === annotation.commentId}
                  className="text-base text-primary disabled:opacity-40"
                >
                  ↩
                </button>
              </form>
            )}
          </div>
        )}
      </li>
    );
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
        <h2 className="font-display font-medium text-base uppercase tracking-[0.06em]">
          {tn("modalTitle")}
          <span className="ml-1.5 text-muted-foreground">({open.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          {artifactId && (
            <button
              type="button"
              onClick={() => { setGlobalDraftOpen(true); }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-base font-medium hover:bg-primary/90 transition-colors"
              title="Nuevo comentario"
            >
              <PlusCircle className="size-3.5" />
              Nuevo
            </button>
          )}
          <button
            type="button"
            onClick={() => { setSidebarOpen(false); }}
            className="p-1.5 hover:bg-surface-2 rounded-md transition-colors text-muted-foreground hover:text-foreground border border-border"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Global comment draft */}
        {globalDraftOpen && (
          <div className="border-b border-border p-4">
            <form onSubmit={handleGlobalSubmit} className="space-y-2">
              <div className="flex items-center gap-1.5 text-base text-muted-foreground mb-1">
                <Globe className="size-3.5" />
                <span>Comentario general</span>
              </div>
              <Textarea
                value={globalDraftBody}
                onChange={(e) => setGlobalDraftBody(e.target.value)}
                placeholder="Escribe un comentario..."
                rows={3}
                maxLength={2000}
                autoFocus
                className="text-base resize-none"
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={isSubmittingGlobal || !globalDraftBody.trim()}>
                  {isSubmittingGlobal ? "Guardando..." : "Comentar"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setGlobalDraftOpen(false); setGlobalDraftBody(""); }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        )}

        {open.length === 0 && !globalDraftOpen ? (
          <div className="flex flex-col items-center justify-center h-48 p-6 text-center text-muted-foreground">
            <MessageSquare className="size-8 mb-2 opacity-40" />
            <p className="text-base">{tn("noComments")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {open.map((annotation) => renderAnnotationRow(annotation, false))}
          </ul>
        )}

        {/* Resolved section */}
        {resolved.length > 0 && (
          <div className="border-t border-border">
            <button
              type="button"
              onClick={() => setShowResolved((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-base text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Check className="size-3 text-green-500" />
                Resueltos ({resolved.length})
              </span>
              {showResolved ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            </button>
            {showResolved && (
              <ul className="divide-y divide-border">
                {resolved.map((annotation) => renderAnnotationRow(annotation, true))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation strip — fijo al fondo del sidebar */}
      {pendingDeleteId && (() => {
        const target = annotations.find((a) => a.commentId === pendingDeleteId);
        return (
          <div className="shrink-0 border-t border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-base font-medium text-destructive">¿Eliminar comentario?</p>
              {target && (
                <p className="text-base text-muted-foreground line-clamp-2 italic">
                  &ldquo;{target.body.slice(0, 100)}{target.body.length > 100 ? "…" : ""}&rdquo;
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(pendingDeleteId)}
              >
                Eliminar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPendingDeleteId(null)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        );
      })()}
    </aside>
  );
}

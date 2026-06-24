"use client";

import { useState, useCallback, useRef } from "react";
import { MessageSquare, Pin, Globe, ChevronRight, Trash2, Type, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { deleteComment, addComment, addReply } from "@/app/actions/social";
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
    activeCommentId,
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

  const handleDelete = useCallback(
    async (commentId: string) => {
      await deleteComment(commentId);
      removeAnnotation(commentId);
      if (expandedId === commentId) setExpandedId(null);
    },
    [removeAnnotation, expandedId]
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
        <div className="flex items-center gap-2">
          {artifactId && (
            <button
              type="button"
              onClick={() => { setGlobalDraftOpen(true); }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
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
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
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
                className="text-sm resize-none"
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

        {annotations.length === 0 && !globalDraftOpen ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground">
            <MessageSquare className="size-8 mb-2 opacity-40" />
            <p className="text-sm">{tn("noComments")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {annotations.map((annotation) => {
              const isExpanded = expandedId === annotation.commentId;
              return (
                <li
                  key={annotation.commentId}
                  className={cn(
                    "px-4 py-3 hover:bg-surface-2 transition-colors",
                    selectedAnnotationId === annotation.commentId && "bg-surface-2"
                  )}
                >
                  <div
                    className="flex items-start gap-2 cursor-pointer"
                    onClick={() => {
                      const next = isExpanded ? null : annotation.commentId;
                      setExpandedId(next);
                      setSelectedAnnotationId(annotation.commentId);
                      setActiveCommentId(annotation.commentId);
                    }}
                  >
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
                      {annotation.replies.length > 0 && !isExpanded && (
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                          <MessageSquare className="size-2.5" />
                          {annotation.replies.length} {annotation.replies.length === 1 ? "respuesta" : "respuestas"}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(annotation.commentId); }}
                      className="shrink-0 p-1 text-muted-foreground hover:text-destructive transition-colors rounded opacity-0 group-hover:opacity-100"
                      title="Eliminar"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>

                  {/* Inline thread */}
                  {isExpanded && (
                    <div className="mt-3 pl-5 space-y-3">
                      {annotation.replies.map((reply) => (
                        <div key={reply.id} className="flex gap-2">
                          <div className="size-5 shrink-0 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold font-display">
                            {getInitials(reply.userName ?? reply.authorName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {reply.userName ?? reply.authorName ?? tc("anonymous")}
                              </span>
                              <span>{new Date(reply.createdAt).toLocaleDateString()}</span>
                            </div>
                            <p className="text-xs mt-0.5 text-muted-foreground">{reply.body}</p>
                          </div>
                        </div>
                      ))}

                      {artifactId && (
                        <form
                          onSubmit={(e) => handleReplySubmit(e, annotation.commentId)}
                          className="flex items-center gap-2 pt-1"
                        >
                          <input
                            value={replyBodies[annotation.commentId] ?? ""}
                            onChange={(e) =>
                              setReplyBodies((prev) => ({
                                ...prev,
                                [annotation.commentId]: e.target.value,
                              }))
                            }
                            placeholder="Responder..."
                            maxLength={500}
                            className="flex-1 text-xs bg-transparent border-b border-border outline-none placeholder:text-muted-foreground py-1"
                          />
                          <button
                            type="submit"
                            disabled={
                              !replyBodies[annotation.commentId]?.trim() ||
                              replyingId === annotation.commentId
                            }
                            className="text-xs text-primary disabled:opacity-40"
                          >
                            ↩
                          </button>
                        </form>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDelete(annotation.commentId)}
                        className="text-[10px] text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="size-2.5" /> Eliminar comentario
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

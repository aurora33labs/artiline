"use client";

import { useState, useRef, useEffect } from "react";
import { Trash2, MessageSquare, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { deleteComment, addReply } from "@/app/actions/social";
import type { Annotation } from "@/components/annotation-provider";

interface CommentBubbleProps {
  annotation: Annotation;
  top: number;
  isActive: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: (commentId: string) => void;
  onResolve?: () => void;
  isDraft?: boolean;
  draftDefaultText?: string;
  onDraftSubmit?: (body: string) => Promise<void>;
  onDraftCancel?: () => void;
  artifactId?: string;
  workspaceSlug?: string;
  slug?: string;
}

function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "justo ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export function CommentBubble({
  annotation,
  top,
  isActive,
  onActivate,
  onDeactivate,
  onDelete,
  onResolve,
  isDraft = false,
  draftDefaultText = "",
  onDraftSubmit,
  onDraftCancel,
  artifactId,
  workspaceSlug,
  slug,
}: CommentBubbleProps) {
  const [draftBody, setDraftBody] = useState(draftDefaultText);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const displayName = annotation.userName ?? annotation.userEmail ?? annotation.authorName ?? "Anónimo";

  // Close on outside click when active
  useEffect(() => {
    if (!isActive || isDraft) return;
    const handler = (e: MouseEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
        onDeactivate();
        setPendingDelete(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isActive, isDraft, onDeactivate]);

  const handleDeleteConfirmed = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleting(true);
    try {
      await deleteComment(annotation.commentId);
      onDelete(annotation.commentId);
    } finally {
      setIsDeleting(false);
      setPendingDelete(false);
    }
  };

  const handleDraftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftBody.trim() || !onDraftSubmit) return;
    setIsSubmitting(true);
    try {
      await onDraftSubmit(draftBody.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim() || !artifactId) return;
    setIsReplying(true);
    try {
      const fd = new FormData();
      fd.set("parentCommentId", annotation.commentId);
      fd.set("body", replyBody.trim());
      fd.set("artifactId", artifactId);
      if (workspaceSlug) fd.set("workspaceSlug", workspaceSlug);
      if (slug) fd.set("slug", slug);
      await addReply(fd);
      setReplyBody("");
    } finally {
      setIsReplying(false);
    }
  };

  if (isDraft) {
    return (
      <div
        ref={bubbleRef}
        className="absolute right-2 w-[268px] rounded-lg border border-primary bg-surface shadow-lg z-30"
        style={{ top }}
      >
        <form onSubmit={handleDraftSubmit} className="p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <MessageSquare className="size-3 text-primary" />
            <span className="font-medium text-foreground">Nuevo comentario</span>
          </div>
          <Textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            placeholder="Escribe un comentario..."
            rows={3}
            maxLength={2000}
            autoFocus
            className="text-sm resize-none"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isSubmitting || !draftBody.trim()}>
              {isSubmitting ? "Guardando..." : "Comentar"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDraftCancel}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div
      ref={bubbleRef}
      className={cn(
        "absolute right-2 w-[268px] rounded-lg border bg-surface shadow-md transition-all duration-150 cursor-pointer z-20",
        isActive
          ? "border-primary ring-1 ring-primary/30 shadow-lg"
          : "border-border hover:border-border-strong hover:shadow-lg"
      )}
      style={{ top }}
      onClick={onActivate}
    >
      {/* Collapsed header — always visible */}
      <div className="flex items-start gap-2 p-3">
        <div className="size-6 shrink-0 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold font-display">
          {getInitials(displayName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-medium truncate">{displayName}</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-muted-foreground">
                {formatRelativeTime(annotation.createdAt)}
              </span>
              {onResolve && !isDraft && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onResolve(); }}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-green-600/30 bg-green-600/10 text-green-600/80 hover:bg-green-600/20 hover:text-green-500 hover:border-green-500/50 transition-colors text-[10px] font-medium"
                  title="Marcar resuelto"
                >
                  <Check className="size-3" />
                </button>
              )}
            </div>
          </div>
          <p className={cn("text-xs text-muted-foreground mt-0.5", !isActive && "line-clamp-2")}>
            {annotation.body}
          </p>
          {annotation.selectedText && !isActive && (
            <p className="text-[10px] text-muted-foreground/70 italic truncate mt-1 border-l-2 border-primary/30 pl-1.5">
              &ldquo;{annotation.selectedText.slice(0, 60)}{annotation.selectedText.length > 60 ? "…" : ""}&rdquo;
            </p>
          )}
          {!isActive && annotation.replies.length > 0 && (
            <p className="text-[9px] text-muted-foreground mt-1 flex items-center gap-0.5">
              <MessageSquare className="size-2.5" />
              {annotation.replies.length}
            </p>
          )}
        </div>
      </div>

      {/* Expanded: replies + reply input + actions */}
      {isActive && (
        <div onClick={(e) => e.stopPropagation()}>
          {annotation.replies.length > 0 && (
            <div className="border-t border-border px-3 py-2 space-y-2">
              {annotation.replies.map((reply) => (
                <div key={reply.id} className="flex gap-2">
                  <div className="size-5 shrink-0 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold font-display">
                    {getInitials(reply.userName ?? reply.authorName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {reply.userName ?? reply.authorName ?? "Anónimo"}
                      </span>
                      <span>{formatRelativeTime(reply.createdAt)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{reply.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {artifactId && (
            <div className="border-t border-border px-3 py-2">
              <form onSubmit={handleReplySubmit} className="flex items-center gap-2">
                <input
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Responder..."
                  maxLength={500}
                  className="flex-1 text-xs bg-transparent border-b border-border outline-none placeholder:text-muted-foreground py-1"
                />
                <button
                  type="submit"
                  disabled={!replyBody.trim() || isReplying}
                  className="text-xs text-primary disabled:opacity-40"
                >
                  ↩
                </button>
              </form>
            </div>
          )}

          <div className="flex items-center justify-between px-3 pb-2 border-t border-border pt-2">
            {/* Resolve button */}
            {onResolve && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onResolve(); }}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-green-500 transition-colors rounded px-1 py-0.5"
                title="Marcar resuelto"
              >
                <Check className="size-3.5" />
                Resolver
              </button>
            )}

            {/* Delete: primer clic muestra panel de confirmación debajo */}
            <div className="flex items-center gap-1 ml-auto">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPendingDelete(true); }}
                className="p-1 text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors rounded"
                title="Eliminar"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          </div>

          {/* Confirmación de borrado — panel dentro de la burbuja */}
          {pendingDelete && (
            <div className="mx-3 mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <p className="text-xs text-destructive font-medium">¿Eliminar este comentario?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDeleteConfirmed}
                  disabled={isDeleting}
                  className="px-2.5 py-1 rounded text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? "Eliminando..." : "Eliminar"}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPendingDelete(false); }}
                  className="px-2.5 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

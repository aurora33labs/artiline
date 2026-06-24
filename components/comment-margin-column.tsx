"use client";

import { useMemo } from "react";
import { CommentBubble } from "@/components/comment-bubble";
import { useAnnotations, type Annotation, type PendingSelection } from "@/components/annotation-provider";

const BUBBLE_H_COLLAPSED = 72;
const BUBBLE_H_EXPANDED = 140;
const GAP = 8;

function computeTops(
  items: Array<{ commentId: string; y: number; isActive: boolean }>,
  containerHeight: number,
): Map<string, number> {
  if (containerHeight === 0) return new Map();
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const tops = new Map<string, number>();
  let prevBottom = 0;
  for (const item of sorted) {
    const natural = item.y * containerHeight;
    const top = Math.max(natural, prevBottom);
    tops.set(item.commentId, top);
    prevBottom = top + (item.isActive ? BUBBLE_H_EXPANDED : BUBBLE_H_COLLAPSED) + GAP;
  }
  return tops;
}

interface CommentMarginColumnProps {
  annotations: Annotation[];
  containerHeight: number;
  activeCommentId: string | null;
  onActivate: (commentId: string | null) => void;
  onConfirmComment: (body: string, draft: PendingSelection) => Promise<void>;
  onDelete: (commentId: string) => void;
  onResolve: (commentId: string) => void;
  artifactId: string;
  versionId?: string | null;
  workspaceSlug?: string;
  slug?: string;
}

export function CommentMarginColumn({
  annotations,
  containerHeight,
  activeCommentId,
  onActivate,
  onConfirmComment,
  onDelete,
  onResolve,
  artifactId,
  workspaceSlug,
  slug,
}: CommentMarginColumnProps) {
  const { commentDraft, setCommentDraft } = useAnnotations();

  const visibleAnnotations = annotations.filter((a) => !a.resolved && a.targetType !== "global");

  const items = useMemo(() => {
    const base = visibleAnnotations.map((a) => ({
      commentId: a.commentId,
      y: a.y,
      isActive: a.commentId === activeCommentId,
    }));
    if (commentDraft) {
      base.push({ commentId: "__draft__", y: commentDraft.y, isActive: true });
    }
    return base;
  }, [visibleAnnotations, activeCommentId, commentDraft]);

  const tops = useMemo(() => computeTops(items, containerHeight), [items, containerHeight]);

  const handleDraftSubmit = async (body: string) => {
    if (!commentDraft) return;
    await onConfirmComment(body, commentDraft);
    setCommentDraft(null);
  };

  const handleDraftCancel = () => {
    setCommentDraft(null);
  };

  const hasBubbles = visibleAnnotations.length > 0 || commentDraft !== null;
  if (!hasBubbles) return null;

  return (
    <div
      className="absolute right-16 top-0 w-[280px] hidden md:block pointer-events-none"
      style={{ height: containerHeight || undefined }}
    >
      {visibleAnnotations.map((annotation) => {
        const top = tops.get(annotation.commentId) ?? annotation.y * containerHeight;
        return (
          <div key={annotation.commentId} className="pointer-events-auto">
            <CommentBubble
              annotation={annotation}
              top={top}
              isActive={annotation.commentId === activeCommentId}
              onActivate={() => onActivate(annotation.commentId)}
              onDeactivate={() => onActivate(null)}
              onDelete={onDelete}
              onResolve={() => onResolve(annotation.commentId)}
              artifactId={artifactId}
              workspaceSlug={workspaceSlug}
              slug={slug}
            />
          </div>
        );
      })}

      {commentDraft && (() => {
        const draftAnnotation: Annotation = {
          id: "__draft__",
          commentId: "__draft__",
          x: commentDraft.x,
          y: commentDraft.y,
          width: commentDraft.width,
          height: commentDraft.height,
          targetType: "area",
          iframeX: null, iframeY: null,
          selectedText: null,
          anchorXPath: null, anchorOffset: null,
          anchorEndXPath: null, anchorEndOffset: null,
          body: "", authorName: null, userName: null, userEmail: null,
          createdAt: new Date().toISOString(),
          resolved: false,
          replies: [],
        };
        const top = tops.get("__draft__") ?? commentDraft.y * containerHeight;
        return (
          <div className="pointer-events-auto">
            <CommentBubble
              annotation={draftAnnotation}
              top={top}
              isActive
              onActivate={() => {}}
              onDeactivate={() => {}}
              onDelete={() => {}}
              isDraft
              onDraftSubmit={handleDraftSubmit}
              onDraftCancel={handleDraftCancel}
            />
          </div>
        );
      })()}
    </div>
  );
}

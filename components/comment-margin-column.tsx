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
  onConfirmElementComment: (body: string) => Promise<void>;
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
  onConfirmElementComment,
  onDelete,
  onResolve,
  artifactId,
  workspaceSlug,
  slug,
}: CommentMarginColumnProps) {
  const { commentDraft, setCommentDraft, pendingElementDraft, setPendingElementDraft, elementRects } = useAnnotations();

  // `area` is hidden (mode removed); `global` has no anchor position.
  const visibleAnnotations = annotations.filter(
    (a) => !a.resolved && a.targetType !== "global" && a.targetType !== "area",
  );

  // For sorting/layout: element annotations use live rect top if available, else normalized y
  const getEffectiveY = (a: Annotation): number => {
    if (a.targetType === "element" && elementRects[a.commentId]) {
      return elementRects[a.commentId].top / (containerHeight || 1);
    }
    return a.y;
  };

  const items = useMemo(() => {
    const base = visibleAnnotations.map((a) => ({
      commentId: a.commentId,
      y: getEffectiveY(a),
      isActive: a.commentId === activeCommentId,
    }));
    if (commentDraft) {
      base.push({ commentId: "__draft__", y: commentDraft.y, isActive: true });
    }
    if (pendingElementDraft) {
      const draftY = containerHeight > 0 ? pendingElementDraft.rect.top / containerHeight : 0;
      base.push({ commentId: "__element_draft__", y: draftY, isActive: true });
    }
    return base;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleAnnotations, activeCommentId, commentDraft, pendingElementDraft, elementRects, containerHeight]);

  const tops = useMemo(() => computeTops(items, containerHeight), [items, containerHeight]);

  const handleDraftSubmit = async (body: string) => {
    if (!commentDraft) return;
    await onConfirmComment(body, commentDraft);
    setCommentDraft(null);
  };

  const handleDraftCancel = () => {
    setCommentDraft(null);
  };

  const handleElementDraftCancel = () => {
    setPendingElementDraft(null);
  };

  const hasBubbles = visibleAnnotations.length > 0 || commentDraft !== null || pendingElementDraft !== null;
  if (!hasBubbles) return null;

  return (
    <div
      className="absolute right-16 top-0 w-[280px] hidden md:block pointer-events-none"
      style={{ height: containerHeight || undefined }}
    >
      {visibleAnnotations.map((annotation) => {
        // Use live rect top for element annotations
        let top: number;
        if (annotation.targetType === "element" && elementRects[annotation.commentId]) {
          top = elementRects[annotation.commentId].top;
        } else {
          top = tops.get(annotation.commentId) ?? annotation.y * containerHeight;
        }
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

      {/* Area drag draft */}
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

      {/* Element inspect draft */}
      {pendingElementDraft && (() => {
        const draftAnnotation: Annotation = {
          id: "__element_draft__",
          commentId: "__element_draft__",
          x: 0,
          y: containerHeight > 0 ? pendingElementDraft.rect.top / containerHeight : 0,
          width: null, height: null,
          targetType: "element",
          iframeX: null, iframeY: null,
          selectedText: null,
          anchorXPath: pendingElementDraft.xpath, anchorOffset: null,
          anchorEndXPath: null, anchorEndOffset: null,
          body: "", authorName: null, userName: null, userEmail: null,
          createdAt: new Date().toISOString(),
          resolved: false,
          replies: [],
        };
        const top = tops.get("__element_draft__") ?? pendingElementDraft.rect.top;
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
              onDraftSubmit={onConfirmElementComment}
              onDraftCancel={handleElementDraftCancel}
            />
          </div>
        );
      })()}
    </div>
  );
}

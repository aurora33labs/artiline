"use client";

import { useMemo, useState } from "react";
import { CommentBubble } from "@/components/comment-bubble";
import { SelectionTooltip } from "@/components/selection-tooltip";
import type { Annotation, PendingSelection } from "@/components/annotation-provider";

const BUBBLE_H_COLLAPSED = 72;
const BUBBLE_H_EXPANDED = 140;
const GAP = 8;

function computeTops(
  items: Array<{ commentId: string; y: number; isActive: boolean; isDraft?: boolean }>,
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
    const h = item.isActive ? BUBBLE_H_EXPANDED : BUBBLE_H_COLLAPSED;
    prevBottom = top + h + GAP;
  }

  return tops;
}

interface CommentMarginColumnProps {
  annotations: Annotation[];
  containerHeight: number;
  activeCommentId: string | null;
  onActivate: (commentId: string | null) => void;
  pendingSelection: PendingSelection | null;
  onConfirmComment: (body: string, selection: PendingSelection) => Promise<void>;
  onDismissPending: () => void;
  onDelete: (commentId: string) => void;
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
  pendingSelection,
  onConfirmComment,
  onDismissPending,
  onDelete,
}: CommentMarginColumnProps) {
  const [draftMode, setDraftMode] = useState(false);
  const [capturedSelection, setCapturedSelection] = useState<PendingSelection | null>(null);

  const hasContent = annotations.length > 0 || pendingSelection !== null;

  const items = useMemo(() => {
    const base = annotations.map((a) => ({
      commentId: a.commentId,
      y: a.y,
      isActive: a.commentId === activeCommentId,
    }));
    if (draftMode && capturedSelection) {
      base.push({ commentId: "__draft__", y: capturedSelection.rectY, isActive: true, isDraft: true } as typeof base[0] & { isDraft: boolean });
    }
    return base;
  }, [annotations, activeCommentId, draftMode, capturedSelection]);

  const tops = useMemo(
    () => computeTops(items, containerHeight),
    [items, containerHeight]
  );

  const handleAddComment = () => {
    if (!pendingSelection) return;
    setCapturedSelection(pendingSelection);
    setDraftMode(true);
  };

  const handleDraftSubmit = async (body: string) => {
    if (!capturedSelection) return;
    await onConfirmComment(body, capturedSelection);
    setDraftMode(false);
    setCapturedSelection(null);
  };

  const handleDraftCancel = () => {
    setDraftMode(false);
    setCapturedSelection(null);
    onDismissPending();
  };

  if (!hasContent && !draftMode) return null;

  return (
    <div
      className="relative shrink-0 w-[280px] hidden md:block"
      style={{ minHeight: containerHeight || undefined }}
    >
      {/* Selection tooltip — shown when text selected but not yet in draft mode */}
      {pendingSelection && !draftMode && (
        <SelectionTooltip
          pendingSelection={pendingSelection}
          onAddComment={handleAddComment}
          onDismiss={onDismissPending}
        />
      )}

      {/* Real annotation bubbles */}
      {annotations.map((annotation) => {
        const top = tops.get(annotation.commentId) ?? annotation.y * containerHeight;
        return (
          <CommentBubble
            key={annotation.commentId}
            annotation={annotation}
            top={top}
            isActive={annotation.commentId === activeCommentId}
            onActivate={() => onActivate(annotation.commentId)}
            onDeactivate={() => onActivate(null)}
            onDelete={onDelete}
          />
        );
      })}

      {/* Draft bubble */}
      {draftMode && capturedSelection && (() => {
        const draftAnnotation: Annotation = {
          id: "__draft__",
          commentId: "__draft__",
          x: capturedSelection.rectX,
          y: capturedSelection.rectY,
          width: null,
          height: null,
          targetType: "text",
          iframeX: null,
          iframeY: null,
          selectedText: capturedSelection.selectedText,
          anchorXPath: capturedSelection.anchorXPath,
          anchorOffset: capturedSelection.anchorOffset,
          anchorEndXPath: capturedSelection.anchorEndXPath,
          anchorEndOffset: capturedSelection.anchorEndOffset,
          body: "",
          authorName: null,
          userName: null,
          userEmail: null,
          createdAt: new Date().toISOString(),
        };
        const top = tops.get("__draft__") ?? capturedSelection.rectY * containerHeight;
        return (
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
        );
      })()}
    </div>
  );
}

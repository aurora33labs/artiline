"use client";

import { cn } from "@/lib/utils";
import { MouseEvent } from "react";

interface NoteMarkerProps {
  annotation: {
    id: string;
    x: number;
    y: number;
    width: number | null;
    height: number | null;
    targetType: "point" | "area" | "global" | "text";
    commentId: string;
  };
  onClick: (commentId: string, e: MouseEvent<HTMLDivElement>) => void;
  isActive?: boolean;
  artifactType: "html" | "markdown" | "code" | "react";
}

export function NoteMarker({
  annotation,
  onClick,
  isActive,
  artifactType,
}: NoteMarkerProps) {
  const { x, y, width, height, targetType, commentId } = annotation;

  if (targetType === "global") return null;

  const style: React.CSSProperties = {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    ...(width && { width: `${width * 100}%` }),
    ...(height && { height: `${height * 100}%` }),
  };

  if (artifactType === "html" || artifactType === "react") {
    return (
      <div
        className={cn(
          "absolute pointer-events-none",
          targetType === "area" && "border-2 border-primary/50 bg-primary/10",
          isActive && "ring-2 ring-primary ring-offset-2 ring-offset-background"
        )}
        style={style}
        onClick={(e) => onClick(commentId, e)}
        data-comment-id={commentId}
      >
        {targetType === "point" && (
          <div
            className={cn(
              "relative w-3 h-3 rounded-full bg-primary border-2 border-background shadow-lg transition-transform hover:scale-125",
              isActive && "scale-125"
            )}
          >
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "absolute pointer-events-none select-none",
        targetType === "area" && "border-2 border-primary/50 bg-primary/10",
        isActive && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
      style={style}
      onClick={(e) => onClick(commentId, e)}
      data-comment-id={commentId}
    >
      {targetType === "point" && (
        <div
          className={cn(
            "relative w-3 h-3 rounded-full bg-primary border-2 border-background shadow-lg transition-transform hover:scale-125",
            isActive && "scale-125"
          )}
        >
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
        </div>
      )}
    </div>
  );
}
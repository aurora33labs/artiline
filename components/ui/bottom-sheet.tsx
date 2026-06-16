"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import {
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom sheet: anchored to the bottom, grab handle, rounded top. Slides
 * up on enter, down on exit. Renders Radix's Content directly (rather than the
 * shared centered DialogContent) so the slide animation isn't fought by the
 * dialog's hardcoded zoom/center classes.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible label; rendered visually hidden. */
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 w-full rounded-t-2xl bg-popover text-sm text-popover-foreground ring-1 ring-border outline-none duration-200 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-full data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-full",
            className,
          )}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <div
            aria-hidden
            className="mx-auto mt-3 h-1.5 w-9 rounded-full bg-border"
          />
          {children}
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

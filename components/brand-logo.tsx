import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandLogo({
  href = "/",
  size = "md",
  className,
}: {
  href?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeMap = {
    sm: { mark: "size-5", text: "text-sm" },
    md: { mark: "size-6", text: "text-base" },
    lg: { mark: "size-8", text: "text-xl" },
  } as const;
  const s = sizeMap[size];

  const inner = (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display font-bold uppercase tracking-[0.06em]",
        className,
      )}
    >
      <span
        className={cn(
          "bg-primary text-primary-foreground inline-flex items-center justify-center rounded-sm text-[10px] leading-none",
          s.mark,
        )}
        aria-hidden
      >
        A
      </span>
      <span className={cn(s.text)}>Artiline</span>
    </span>
  );

  if (!href) return inner;
  return (
    <Link href={href} className="inline-flex items-center">
      {inner}
    </Link>
  );
}

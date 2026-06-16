import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({
  href = "/",
  size = "md",
  markOnly = false,
  className,
}: {
  href?: string | null;
  size?: "sm" | "md" | "lg";
  markOnly?: boolean;
  className?: string;
}) {
  const sizeMap = {
    sm: { mark: "size-5", px: 20, text: "text-sm" },
    md: { mark: "size-6", px: 24, text: "text-base" },
    lg: { mark: "size-8", px: 32, text: "text-xl" },
  } as const;
  const s = sizeMap[size];

  const inner = (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display font-bold uppercase tracking-[0.06em]",
        className,
      )}
    >
      <Image
        src="/artiline.webp"
        alt="Artiline"
        width={s.px}
        height={s.px}
        className={cn("rounded-sm object-cover", s.mark)}
      />
      {!markOnly && <span className={cn(s.text)}>Artiline</span>}
    </span>
  );

  if (!href) return inner;
  return (
    <Link href={href} className="inline-flex items-center">
      {inner}
    </Link>
  );
}

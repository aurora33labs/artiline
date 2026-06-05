"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { gsap } from "gsap";
import { Button } from "@/components/ui/button";
import { DropDemo, type DropDemoStrings } from "@/components/landing/drop-demo";

export type HeroStrings = {
  h1: string;
  sub: string;
  ctaCreate: string;
  ctaLogin: string;
  noCard: string;
  demoTag: string;
};

type Tile = { n: string; type: string; accent?: boolean };

// Static catalog wall — deterministic so SSR and client markup match.
const WALL: Tile[][] = [
  [
    { n: "061", type: "HTML", accent: true },
    { n: "058", type: "MD" },
    { n: "054", type: "CODE" },
    { n: "049", type: "PNG" },
    { n: "043", type: "HTML" },
    { n: "038", type: "MD" },
  ],
  [
    { n: "060", type: "CODE" },
    { n: "056", type: "HTML", accent: true },
    { n: "051", type: "PNG" },
    { n: "047", type: "HTML" },
    { n: "041", type: "CODE" },
    { n: "036", type: "MD" },
  ],
  [
    { n: "059", type: "PNG" },
    { n: "055", type: "MD" },
    { n: "050", type: "HTML" },
    { n: "045", type: "CODE", accent: true },
    { n: "040", type: "HTML" },
    { n: "034", type: "PNG" },
  ],
  [
    { n: "057", type: "HTML" },
    { n: "053", type: "CODE" },
    { n: "048", type: "MD" },
    { n: "044", type: "PNG" },
    { n: "039", type: "HTML", accent: true },
    { n: "033", type: "CODE" },
  ],
];

// Duplicate the columns so the wall spans the full bleed width.
const COLUMNS: Tile[][] = [...WALL, ...WALL];

export function Hero({ s, demo }: { s: HeroStrings; demo: DropDemoStrings }) {
  const root = useRef<HTMLElement>(null);
  const cols = useRef<(HTMLDivElement | null)[]>([]);

  // Load choreography. Skipped under reduced motion (everything is visible by
  // default in CSS, so the section just renders statically).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.set("[data-h-h1]", { autoAlpha: 0 });
      gsap.set("[data-h-sub],[data-h-cta],[data-h-meta]", { autoAlpha: 0, y: 14 });
      gsap.set("[data-h-reg]", { autoAlpha: 0, scale: 0.6, rotate: -25 });
      gsap.set("[data-h-frame]", { clipPath: "inset(0 0 100% 0)" });
      gsap.set("[data-h-tile]", { autoAlpha: 0, y: 24 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to("[data-h-tile]", { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.012 }, 0)
        .to(
          "[data-h-reg]",
          { autoAlpha: 1, scale: 1, rotate: 0, duration: 0.7, ease: "back.out(1.6)" },
          0.2,
        )
        .to("[data-h-bar]", { scaleX: 1, duration: 0.42, ease: "power2.inOut" }, 0.25)
        .set("[data-h-h1]", { autoAlpha: 1 })
        .to("[data-h-bar]", {
          scaleX: 0,
          transformOrigin: "right center",
          duration: 0.42,
          ease: "power2.inOut",
        })
        .to(
          "[data-h-sub],[data-h-cta],[data-h-meta]",
          { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.07 },
          "-=0.2",
        )
        .to(
          "[data-h-frame]",
          { clipPath: "inset(0 0 0% 0)", duration: 0.8, ease: "power3.inOut" },
          "-=0.45",
        );
    }, root);

    return () => ctx.revert();
  }, []);

  // Parallax on the wall columns, driven by scroll position (Lenis updates the
  // real scroll, so window.scrollY is the smoothed value).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const factors = [0.06, -0.04, 0.08, -0.05];
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        cols.current.forEach((el, i) => {
          if (el) el.style.transform = `translate3d(0, ${y * factors[i % factors.length]}px, 0)`;
        });
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section
      ref={root}
      className="relative flex min-h-[88vh] flex-col justify-center overflow-hidden py-12 lg:py-16"
    >
      {/* Catalog wall — faint ambient field, faded toward the copy (left) and
          the bottom so it never competes with the headline or the demo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 flex justify-center gap-2.5 overflow-hidden opacity-[0.14] [mask-image:linear-gradient(105deg,transparent,transparent_38%,black_72%),linear-gradient(to_bottom,black,black_58%,transparent)] [mask-composite:intersect]"
      >
        {COLUMNS.map((col, ci) => (
          <div
            key={ci}
            ref={(el) => {
              cols.current[ci] = el;
            }}
            className={`-mt-10 flex w-[120px] shrink-0 flex-col gap-2.5 ${ci % 2 ? "mt-2" : ""}`}
          >
            {col.map((tile) => (
              <WallTile key={`${ci}-${tile.n}`} tile={tile} />
            ))}
          </div>
        ))}
      </div>

      {/* Registration mark — single riso accent, top-right */}
      <div
        data-h-reg
        aria-hidden
        className="absolute right-8 top-10 hidden items-center gap-2 text-primary lg:flex"
      >
        <span className="font-mono text-xs tabular-nums">#047</span>
        <svg
          width="30"
          height="30"
          viewBox="0 0 30 30"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="15" cy="15" r="9" />
          <path d="M15 1v9M15 20v9M1 15h9M20 15h9" />
        </svg>
      </div>

      <div className="mx-auto w-full max-w-[1400px] px-6 lg:px-10">
        {/* Copy — left-aligned, no box, directly over the dimmed wall */}
        <div className="max-w-[46rem]">
          <h1 className="relative inline-block">
            <span
              data-h-bar
              aria-hidden
              className="absolute inset-0 z-10 origin-left scale-x-0 bg-primary"
            />
            <span
              data-h-h1
              className="block font-display font-extrabold leading-[1.02] tracking-[-0.03em]"
              style={{ fontSize: "clamp(2rem, 6vw, 4rem)" }}
            >
              {s.h1}
            </span>
          </h1>
          <p
            data-h-sub
            className="mt-4 max-w-[52ch] text-base leading-relaxed text-muted-foreground"
          >
            {s.sub}
          </p>
          <div data-h-cta className="mt-5 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link href="/signup">
                {s.ctaCreate}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/login">{s.ctaLogin}</Link>
            </Button>
          </div>
          <p data-h-meta className="meta mt-4">
            {s.noCard}
          </p>
        </div>

        {/* Live demo — wide, pre-loaded with a dashboard (not a second hero) */}
        <div data-h-frame className="mt-10 w-full lg:mt-14">
          <div className="flex h-9 items-center justify-between rounded-t-sm border border-b-0 border-border-strong bg-surface px-4">
            <div className="flex items-center gap-1.5">
              <span className="block h-2.5 w-2.5 rounded-full border border-border-strong" />
              <span className="block h-2.5 w-2.5 rounded-full border border-border-strong" />
              <span className="block h-2.5 w-2.5 rounded-full border border-border-strong" />
            </div>
            <span className="meta">{s.demoTag}</span>
          </div>
          <div className="overflow-hidden rounded-b-sm border border-border-strong">
            <DropDemo s={demo} autoload={1} />
          </div>
        </div>
      </div>
    </section>
  );
}

function WallTile({ tile }: { tile: Tile }) {
  return (
    <div data-h-tile className="rounded border border-border bg-surface/60 p-2.5">
      <div className="flex items-center justify-between">
        <span
          className={`font-mono text-xs tabular-nums ${tile.accent ? "text-primary" : "text-muted-foreground"}`}
        >
          #{tile.n}
        </span>
        <span className="meta">{tile.type}</span>
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="h-1 w-3/4 rounded-full bg-border" />
        <div className="h-1 w-1/2 rounded-full bg-border" />
        <div
          className={`mt-1.5 h-9 rounded ${tile.accent ? "bg-primary/15" : "bg-border/50"}`}
        />
      </div>
    </div>
  );
}

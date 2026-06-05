"use client";

import { useState } from "react";
import { Lock, Users, Globe, KeyRound, Hash } from "lucide-react";

export type VisibilityLevel = {
  key: "team" | "team_pw" | "public" | "public_pw";
  name: string;
  desc: string;
  /** What the recipient sees when they open the link at this level. */
  view: string;
};

export type VisibilityDialStrings = {
  recipientLabel: string;
  madeWith: string;
  levels: VisibilityLevel[];
};

const ICONS = {
  team: Users,
  team_pw: KeyRound,
  public: Globe,
  public_pw: Lock,
} as const;

export function VisibilityDial({ s }: { s: VisibilityDialStrings }) {
  const [active, setActive] = useState(0);
  const level = s.levels[active];

  return (
    <div className="grid gap-px overflow-hidden rounded border border-border-strong bg-border-strong lg:grid-cols-2">
      {/* Selector — segmented list of the four levels */}
      <div className="flex flex-col bg-background">
        <div className="border-b border-border px-4 py-2.5">
          <span className="meta">NIVEL DE ACCESO</span>
        </div>
        <ul className="divide-y divide-border">
          {s.levels.map((lvl, i) => {
            const Icon = ICONS[lvl.key];
            const selected = i === active;
            return (
              <li key={lvl.key}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-pressed={selected}
                  className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors duration-150 ${
                    selected
                      ? "bg-surface-2"
                      : "hover:bg-surface focus-visible:bg-surface"
                  } outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
                >
                  <Icon
                    className={`mt-0.5 size-4 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span
                      className={`block text-sm font-semibold ${selected ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {lvl.name}
                    </span>
                    <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                      {lvl.desc}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Recipient preview — what the person who opens the link gets */}
      <div className="flex flex-col bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="meta">{s.recipientLabel}</span>
          <span className="meta text-primary">{level.name}</span>
        </div>
        <div className="flex flex-1 flex-col gap-4 px-5 py-6">
          {/* Mock browser bar */}
          <div className="flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
            <Hash className="size-3 text-primary" aria-hidden />
            <span className="tabular-nums">047</span>
            <span className="truncate">artiline.app/a/x7k2qd</span>
          </div>
          {/* State of the artifact at this level */}
          <div className="flex flex-1 items-center justify-center rounded-sm border border-dashed border-border-strong px-6 py-10 text-center">
            <p className="max-w-[34ch] text-base leading-relaxed text-foreground">
              {level.view}
            </p>
          </div>
          {(level.key === "public" || level.key === "public_pw") && (
            <p className="meta text-center">{s.madeWith}</p>
          )}
        </div>
      </div>
    </div>
  );
}

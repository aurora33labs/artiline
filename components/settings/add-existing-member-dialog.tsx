"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addExistingMembers } from "@/app/[workspace]/(nav)/settings/actions";

type Candidate = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

function initials(src: string): string {
  const parts = src.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? "?").toUpperCase();
  return ((parts[0][0] ?? "") + (parts[1][0] ?? "")).toUpperCase();
}

export function AddExistingMemberDialog({
  workspaceSlug,
  candidates,
}: {
  workspaceSlug: string;
  candidates: Candidate[];
}) {
  const t = useTranslations("settings");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("member");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.email.toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q),
    );
  }, [candidates, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (selected.size === 0) return;
    const fd = new FormData();
    fd.set("workspaceSlug", workspaceSlug);
    fd.set("role", role);
    for (const id of selected) fd.append("userIds", id);
    start(async () => {
      await addExistingMembers(fd);
      setSelected(new Set());
      setQuery("");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="h-10">
          <UserPlus className="size-4" />
          {t("addExistingBtn")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addExistingTitle")}</DialogTitle>
          <DialogDescription>{t("addExistingSubtitle")}</DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            {t("addExistingEmpty")}
          </p>
        ) : (
          <div className="space-y-4">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("addExistingSearch")}
              className="h-10"
            />

            <ul className="max-h-64 overflow-y-auto border border-border divide-y divide-border">
              {filtered.map((c) => {
                const display = c.name ?? c.email;
                const checked = selected.has(c.id);
                return (
                  <li key={c.id}>
                    <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c.id)}
                        className="size-4 accent-primary"
                      />
                      {c.image ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={c.image}
                          alt={display}
                          className="size-8 rounded-sm object-cover border border-border"
                        />
                      ) : (
                        <div className="size-8 rounded-sm border border-border-strong bg-surface-2 text-foreground font-display text-[10px] font-bold flex items-center justify-center">
                          {initials(display)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {display}
                        </div>
                        <div className="meta truncate">{c.email}</div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-end gap-2">
              <div className="w-36 space-y-1.5">
                <Label>{t("addExistingRole")}</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">{t("memberRole")}</SelectItem>
                    <SelectItem value="admin">{t("adminRole")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                className="h-10 flex-1"
                disabled={selected.size === 0 || pending}
                onClick={submit}
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t("addExistingSubmit")}
                {selected.size > 0 ? ` (${selected.size})` : ""}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

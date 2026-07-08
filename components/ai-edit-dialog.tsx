"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AiEditEvent =
  | { type: "tick" }
  | { type: "result"; slug: string; versionNumber: number }
  | { type: "error"; error: string };
type AiEditFinalEvent = Extract<AiEditEvent, { type: "result" | "error" }>;

/** Read the ai-edit route's newline-delimited JSON stream to its final event. */
async function readAiEditStream(
  res: Response,
): Promise<AiEditFinalEvent | undefined> {
  const reader = res.body?.getReader();
  if (!reader) return undefined;
  const decoder = new TextDecoder();
  let buffer = "";
  let final: AiEditFinalEvent | undefined;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      try {
        const event = JSON.parse(line) as AiEditEvent;
        if (event.type === "result" || event.type === "error") final = event;
      } catch {
        /* ignore a malformed line — the stream may still recover */
      }
    }
  }
  return final;
}

/**
 * Rewrite the artifact's current content via an OpenRouter model and publish
 * the result as a new live version. Only shown to canEdit users (author/
 * owner/admin) — same authority as PublishVersionDialog. Model choices come
 * from the operator's ARTILINE_AI_MODEL_1/2/3 env vars.
 */
export function AiEditDialog({
  artifactId,
  workspaceSlug,
  models,
  open,
  onOpenChange,
}: {
  artifactId: string;
  workspaceSlug: string;
  models: { id: string; label: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [model, setModel] = useState(models[0]?.id ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();

  const t = useTranslations("aiEdit");
  const tc = useTranslations("common");
  const tt = useTranslations("toasts");
  const te = useTranslations("errors");

  function translateError(code: string): string {
    return te.has(code) ? te(code) : tt("generic");
  }

  function submit() {
    if (!instruction.trim()) {
      toast.error(t("noInstruction"));
      return;
    }
    start(async () => {
      try {
        const res = await fetch(`/api/artifacts/${artifactId}/ai-edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceSlug,
            instruction: instruction.trim(),
            model,
          }),
        });
        if (!res.ok) {
          // Pre-stream validation failures (bad model, auth, not found) —
          // still a plain JSON body.
          const { error } = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          toast.error(translateError(error || "generic"));
          return;
        }

        // 200 means the response is a newline-delimited JSON stream: periodic
        // `{"type":"tick"}` heartbeats while the model runs, then one final
        // result/error line. Streaming keeps the connection alive for
        // long-running generations that would otherwise idle-timeout behind
        // a proxy.
        const outcome = await readAiEditStream(res);
        if (outcome?.type === "result") {
          toast.success(t("success"));
          onOpenChange(false);
          setInstruction("");
          router.refresh();
          return;
        }
        toast.error(translateError(outcome?.error || "generic"));
      } catch {
        toast.error(translateError("generic"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-edit-model">{t("modelLabel")}</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="ai-edit-model" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-edit-instruction">
              {t("instructionLabel")}
            </Label>
            <Textarea
              id="ai-edit-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              maxLength={4000}
              rows={4}
              placeholder={t("instructionPlaceholder")}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {tc("cancel")}
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending || !instruction.trim() || !model}
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("generating")}
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  {t("generate")}
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

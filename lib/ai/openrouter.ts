import "server-only";
import type { ArtifactType } from "@/lib/artifacts/create";

export type AiEditModel = { id: string; label: string };

/**
 * AI edit is core (always on) but only usable once the operator supplies an
 * OpenRouter key and at least one model. Self-host and cloud read the same
 * three slots: ARTILINE_AI_MODEL_1/2/3 (+ optional _LABEL). Unset slots are
 * skipped, so 1-3 models can be configured.
 */
export function getAiEditModels(): AiEditModel[] {
  const models: AiEditModel[] = [];
  for (let i = 1; i <= 3; i++) {
    const id = process.env[`ARTILINE_AI_MODEL_${i}`]?.trim();
    if (!id) continue;
    const label = process.env[`ARTILINE_AI_MODEL_${i}_LABEL`]?.trim() || id;
    models.push({ id, label });
  }
  return models;
}

export function isAiEditConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY && getAiEditModels().length > 0;
}

export class AiEditError extends Error {}

const MAX_OUTPUT_CHARS = 20 * 1024 * 1024; // generous ceiling; caller enforces MAX_CONTENT_BYTES

function fenceLanguageHint(type: ArtifactType, language?: string | null): string {
  if (type === "html") return "html";
  if (type === "markdown") return "markdown";
  return language || "";
}

/** Strip a single leading/trailing fenced code block, if the model wrapped its answer in one. */
function unwrapFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return match ? match[1] : trimmed;
}

/**
 * Send the artifact's full content + a natural-language instruction to an
 * OpenRouter chat model and return the revised full content. The model is told
 * to output ONLY the file — no commentary — so the response can replace the
 * artifact content directly.
 */
export async function generateArtifactEdit(opts: {
  model: string;
  type: ArtifactType;
  language?: string | null;
  content: string;
  instruction: string;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new AiEditError("NOT_CONFIGURED");

  const hint = fenceLanguageHint(opts.type, opts.language);
  const systemPrompt = [
    "You edit a single file for a user based on their instruction.",
    "Output ONLY the complete, updated file content — no explanations, no markdown fence, no commentary before or after.",
    "Preserve everything the instruction doesn't ask you to change.",
    "If the instruction is ambiguous, make the most reasonable interpretation and still return a complete, valid file.",
  ].join(" ");

  const userPrompt = [
    `File type: ${opts.type}${hint ? ` (${hint})` : ""}`,
    "Current content:",
    "```" + hint,
    opts.content,
    "```",
    "",
    `Instruction: ${opts.instruction}`,
  ].join("\n");

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_ARTILINE_HOST
          ? `https://${process.env.NEXT_PUBLIC_ARTILINE_HOST}`
          : "https://artiline.app",
        "X-Title": "Artiline",
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch {
    throw new AiEditError("ERR_UPSTREAM");
  }

  if (!res.ok) {
    throw new AiEditError(res.status === 429 ? "ERR_RATE_LIMITED" : "ERR_UPSTREAM");
  }

  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw || !raw.trim()) throw new AiEditError("ERR_EMPTY_RESPONSE");
  if (raw.length > MAX_OUTPUT_CHARS) throw new AiEditError("ERR_CONTENT_TOO_LARGE");

  return unwrapFence(raw);
}

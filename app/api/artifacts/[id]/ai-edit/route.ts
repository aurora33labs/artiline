import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMemberOrToken, guardErrorResponse } from "@/lib/tenant";
import { aiEditArtifact } from "@/lib/artifacts/ai-edit";
import { getAiEditModels } from "@/lib/ai/openrouter";

export const runtime = "nodejs";
// Only meaningful on Vercel; harmless elsewhere (e.g. Railway, which has no
// such route-level cap). The generation itself can genuinely take minutes.
export const maxDuration = 300;

const bodySchema = z.object({
  workspaceSlug: z.string().min(1),
  instruction: z.string().trim().min(1).max(4000),
  model: z.string().min(1).max(200),
});

const KNOWN_CODES = new Set([
  "NOT_FOUND",
  "FORBIDDEN",
  "NOT_CONFIGURED",
  "ERR_UPSTREAM",
  "ERR_RATE_LIMITED",
  "ERR_EMPTY_RESPONSE",
  "ERR_CONTENT_TOO_LARGE",
]);

/**
 * Streams newline-delimited JSON: periodic `{"type":"tick"}` heartbeats while
 * the (possibly slow) model call runs, then one final `{"type":"result"|...}`
 * line. Model generation can take well over a minute; a plain buffered
 * response sits idle the whole time, and proxies in front of self-hosted
 * deployments (e.g. Cloudflare) kill idle connections around 100s (524). The
 * heartbeat keeps bytes flowing so the connection stays alive regardless of
 * how long the model takes. HTTP status is always 200 once streaming starts —
 * outcome (including auth-adjacent failures raised inside aiEditArtifact) is
 * carried in the final NDJSON line instead.
 */
function streamAiEdit(
  run: () => Promise<{ slug: string; versionNumber: number }>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode('{"type":"tick"}\n'));
        } catch {
          /* controller already closed */
        }
      }, 15000);
      try {
        const { slug, versionNumber } = await run();
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "result", slug, versionNumber }) + "\n",
          ),
        );
      } catch (e) {
        const msg = (e as Error)?.message;
        const error = msg && KNOWN_CODES.has(msg) ? msg : "ERR_INTERNAL";
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "error", error }) + "\n"),
        );
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const data = bodySchema.parse(await req.json());

    // The model must be one of the operator-configured slots — never pass the
    // caller's string straight to OpenRouter.
    const allowed = getAiEditModels();
    if (!allowed.some((m) => m.id === data.model)) {
      return NextResponse.json({ error: "ERR_INVALID_MODEL" }, { status: 400 });
    }

    const auth = await requireMemberOrToken(
      data.workspaceSlug,
      req.headers.get("authorization"),
    );

    return streamAiEdit(() =>
      aiEditArtifact(auth, id, {
        instruction: data.instruction,
        model: data.model,
      }),
    );
  } catch (e) {
    const guard = guardErrorResponse(e);
    if (guard) return guard;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "ERR_INVALID" }, { status: 400 });
    }
    return NextResponse.json({ error: "ERR_INTERNAL" }, { status: 500 });
  }
}

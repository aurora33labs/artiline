import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMemberOrToken, guardErrorResponse } from "@/lib/tenant";
import { aiEditArtifact } from "@/lib/artifacts/ai-edit";
import { getAiEditModels } from "@/lib/ai/openrouter";

export const runtime = "nodejs";
// Model generation can run long on big files/slow models — give it real headroom.
export const maxDuration = 120;

const bodySchema = z.object({
  workspaceSlug: z.string().min(1),
  instruction: z.string().trim().min(1).max(4000),
  model: z.string().min(1).max(200),
});

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

    const { slug, versionNumber } = await aiEditArtifact(auth, id, {
      instruction: data.instruction,
      model: data.model,
    });

    return NextResponse.json({ versionNumber, slug });
  } catch (e) {
    const guard = guardErrorResponse(e);
    if (guard) return guard;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "ERR_INVALID" }, { status: 400 });
    }
    const msg = (e as Error)?.message;
    if (msg === "NOT_FOUND")
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (msg === "FORBIDDEN")
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    if (msg === "ERR_CONTENT_TOO_LARGE") {
      return NextResponse.json({ error: msg }, { status: 413 });
    }
    if (
      msg === "NOT_CONFIGURED" ||
      msg === "ERR_UPSTREAM" ||
      msg === "ERR_RATE_LIMITED" ||
      msg === "ERR_EMPTY_RESPONSE"
    ) {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    return NextResponse.json({ error: "ERR_INTERNAL" }, { status: 500 });
  }
}

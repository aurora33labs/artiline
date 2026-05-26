import { NextResponse } from "next/server";
import { resolveCurrentArtifact } from "@/lib/artifact-resolve";

export const runtime = "nodejs";

const PROVIDER_NAME = "Artiline";
const PROVIDER_URL = "https://artiline.app";
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;

function extractSlug(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/a\/([a-zA-Z0-9_-]+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = url.searchParams.get("url");
  const format = url.searchParams.get("format") ?? "json";
  const maxwidth = Number(url.searchParams.get("maxwidth")) || DEFAULT_WIDTH;
  const maxheight = Number(url.searchParams.get("maxheight")) || DEFAULT_HEIGHT;

  if (!target) {
    return NextResponse.json(
      { error: "missing_url" },
      { status: 400 },
    );
  }
  if (format !== "json") {
    return NextResponse.json(
      { error: "format_not_supported" },
      { status: 501 },
    );
  }

  const slug = extractSlug(target);
  if (!slug) return NextResponse.json({ error: "invalid_url" }, { status: 400 });

  const resolved = await resolveCurrentArtifact(slug);
  if (!resolved || resolved.artifact.visibility !== "public") {
    return NextResponse.json({ error: "not_embeddable" }, { status: 404 });
  }

  const origin = new URL(req.url).origin;
  const embedUrl = `${origin}/embed/${slug}`;
  const width = Math.min(maxwidth, DEFAULT_WIDTH);
  const height = Math.min(maxheight, DEFAULT_HEIGHT);

  return NextResponse.json({
    version: "1.0",
    type: "rich",
    provider_name: PROVIDER_NAME,
    provider_url: PROVIDER_URL,
    title: resolved.version.title,
    html: `<iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>`,
    width,
    height,
  });
}

export type ArtifactType = "html" | "markdown" | "code";

export type Detected = {
  type: ArtifactType;
  language: string | null;
};

const EXTENSION_MAP: Record<string, Detected> = {
  html: { type: "html", language: null },
  htm: { type: "html", language: null },
  md: { type: "markdown", language: null },
  markdown: { type: "markdown", language: null },
  mdx: { type: "markdown", language: null },
  ts: { type: "code", language: "typescript" },
  tsx: { type: "code", language: "tsx" },
  js: { type: "code", language: "javascript" },
  jsx: { type: "code", language: "jsx" },
  mjs: { type: "code", language: "javascript" },
  cjs: { type: "code", language: "javascript" },
  py: { type: "code", language: "python" },
  go: { type: "code", language: "go" },
  rs: { type: "code", language: "rust" },
  css: { type: "code", language: "css" },
  scss: { type: "code", language: "scss" },
  json: { type: "code", language: "json" },
  sh: { type: "code", language: "bash" },
  bash: { type: "code", language: "bash" },
  zsh: { type: "code", language: "bash" },
  sql: { type: "code", language: "sql" },
  yml: { type: "code", language: "yaml" },
  yaml: { type: "code", language: "yaml" },
  toml: { type: "code", language: "toml" },
  xml: { type: "code", language: "xml" },
  svg: { type: "code", language: "xml" },
  java: { type: "code", language: "java" },
  kt: { type: "code", language: "kotlin" },
  swift: { type: "code", language: "swift" },
  rb: { type: "code", language: "ruby" },
  php: { type: "code", language: "php" },
  c: { type: "code", language: "c" },
  h: { type: "code", language: "c" },
  cpp: { type: "code", language: "cpp" },
  hpp: { type: "code", language: "cpp" },
  cs: { type: "code", language: "csharp" },
  txt: { type: "code", language: "text" },
};

const HTML_HEAD = /^(<!doctype html|<html|<!--|<head|<body|<\?xml)/i;
const HTML_TAIL = /<\/html\s*>/i;
const MARKDOWN_LINE = /^(#{1,6}\s|[*\-]\s|\d+\.\s|\|.*\|\s*$|>\s|```)/;

function basenameExt(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return null;
  return filename.slice(dot + 1).toLowerCase();
}

function detectByContent(content: string): Detected {
  const head = content.trim();
  if (HTML_HEAD.test(head) || HTML_TAIL.test(head)) {
    return { type: "html", language: null };
  }
  const lines = content.split("\n", 20);
  let mdHits = 0;
  for (const line of lines) {
    if (MARKDOWN_LINE.test(line)) mdHits++;
    if (mdHits >= 2) return { type: "markdown", language: null };
  }
  return { type: "code", language: "text" };
}

export function detectArtifact(filename: string, content: string): Detected {
  const ext = basenameExt(filename);
  if (ext && EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];
  return detectByContent(content);
}

export function basenameWithoutExt(filename: string): string {
  const slashed = filename.split(/[/\\]/).pop() ?? filename;
  const dot = slashed.lastIndexOf(".");
  return dot > 0 ? slashed.slice(0, dot) : slashed;
}

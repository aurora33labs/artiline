/**
 * Builds the self-contained HTML document that renders a user's JSX/TSX artifact
 * as a live React component inside the viewer's sandboxed iframe.
 *
 * Isolation: this document is served with `Content-Security-Policy: sandbox
 * allow-scripts` and embedded in `<iframe sandbox="allow-scripts">`, so it runs
 * in an opaque origin with no access to the app's cookies, DOM, or same-origin
 * assets — the exact model HTML artifacts already use. Untrusted code can only
 * touch the iframe itself.
 *
 * Dependencies come from esm.sh (CDN): React/ReactDOM are pinned via an import
 * map; the transpiler is @babel/standalone. Bare `import` specifiers in the user
 * source (e.g. `recharts`) are rewritten at runtime to esm.sh URLs with
 * `?external=react,react-dom` so every package shares the same React singleton.
 * This needs internet in the visitor's browser (a deliberate product choice).
 */

const REACT_VERSION = "19";
const ESM = "https://esm.sh";
// Babel must be the UMD build (sets a global `Babel`) loaded as a classic
// script. esm.sh only serves ESM, which can't define the global — use a CDN
// that ships the UMD bundle.
const BABEL_UMD = "https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js";

const IMPORT_MAP = {
  imports: {
    react: `${ESM}/react@${REACT_VERSION}`,
    "react-dom": `${ESM}/react-dom@${REACT_VERSION}`,
    "react-dom/client": `${ESM}/react-dom@${REACT_VERSION}/client`,
    "react/jsx-runtime": `${ESM}/react@${REACT_VERSION}/jsx-runtime`,
  },
};

// Runs inside the iframe. Decodes the base64 source, transpiles JSX/TS in the
// browser, rewrites bare imports to esm.sh, loads it as an ES module, and mounts
// the default export. Any failure is painted into #root (sandbox-safe text).
const BOOTSTRAP = `
(async () => {
  const root = document.getElementById("root");
  const fail = (msg) => {
    root.innerHTML = "";
    const pre = document.createElement("pre");
    pre.id = "__err";
    pre.textContent = String(msg);
    root.appendChild(pre);
  };
  try {
    const b64 = document.getElementById("__src").textContent || "";
    const source = new TextDecoder().decode(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
    );

    const out = Babel.transform(source, {
      filename: "artifact.tsx",
      presets: [
        ["react", { runtime: "automatic" }],
        ["typescript", { isTSX: true, allExtensions: true, allowDeclareFields: true }],
      ],
    }).code;

    // Rewrite bare specifiers (not react/* and not relative/URL) to esm.sh so
    // arbitrary npm imports resolve; ?external keeps a single React instance.
    const isReactSpec = (s) => s === "react" || s.startsWith("react/") || s === "react-dom" || s.startsWith("react-dom/");
    const rewrite = (code) =>
      code.replace(
        /(?:from|import)\\s*["']([^"'./][^"']*)["']/g,
        (full, spec) => (isReactSpec(spec) || spec.includes("://") ? full : full.replace(spec, "${ESM}/" + spec + "?external=react,react-dom")),
      );

    const blob = new Blob([rewrite(out)], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const mod = await import(url);
    URL.revokeObjectURL(url);

    const App = mod.default;
    if (typeof App !== "function" && !(App && App.$$typeof)) {
      return fail("No default export found. Export your component as the default export, e.g. \`export default function App() { ... }\`.");
    }

    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    createRoot(root).render(React.createElement(App));
  } catch (err) {
    fail((err && err.stack) || (err && err.message) || err);
  }
})();
`;

/** Escapes a string so it is safe to inline between <script> tags. */
function inlineSafe(s: string): string {
  return s.replace(/<\/(script)/gi, "<\\/$1");
}

/**
 * Returns the full HTML document for a renderable React artifact. `source` is the
 * raw JSX/TSX. It is carried as base64 (cannot contain `</script>`), so the user
 * code can never break out of the embedding script tag.
 */
export function renderReactWrapper(source: string): string {
  const b64 = Buffer.from(source, "utf8").toString("base64");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script type="importmap">${inlineSafe(JSON.stringify(IMPORT_MAP))}</script>
<style>
  html, body, #root { margin: 0; height: 100%; }
  #__err { font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: #b00020; white-space: pre-wrap; padding: 16px; }
</style>
</head>
<body>
<div id="root"></div>
<script type="text/plain" id="__src">${b64}</script>
<script src="${BABEL_UMD}"></script>
<script type="module">${inlineSafe(BOOTSTRAP)}</script>
</body>
</html>`;
}

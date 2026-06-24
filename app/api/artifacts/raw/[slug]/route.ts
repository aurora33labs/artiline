import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/lib/db";
import { evaluateAccess } from "@/lib/visibility";
import {
  resolveCurrentArtifact,
  resolveArtifactVersion,
} from "@/lib/artifact-resolve";
import { getContent } from "@/lib/artifact-content";
import { extensionForArtifact, isReactRenderable } from "@/lib/detect-artifact";
import { renderReactWrapper } from "@/lib/react-wrapper";
import { slugify } from "@/lib/tenant";

export const runtime = "nodejs";

const ANNOTATION_SCRIPT = `
<style>
.artiline-highlight { background-color: rgba(255,200,0,0.25); border-radius: 2px; cursor: pointer; }
.artiline-highlight.active { background-color: rgba(255,200,0,0.55); outline: 1px solid rgba(200,160,0,0.6); }
</style>
<script>
(function () {
  var origin = window.parent.origin;

  // --- XPath helpers ---
  function getXPath(node) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) {
      var idx = 0;
      var sib = node.parentNode ? node.parentNode.firstChild : null;
      while (sib) { if (sib === node) break; if (sib.nodeType === Node.TEXT_NODE) idx++; sib = sib.nextSibling; }
      return getXPath(node.parentNode) + '/text()[' + idx + ']';
    }
    if (node === document.documentElement) return '/html';
    if (!node.parentNode) return '';
    var tag = node.tagName.toLowerCase();
    var idx = 1;
    var sib = node.parentNode.firstChild;
    while (sib) { if (sib === node) break; if (sib.nodeType === Node.ELEMENT_NODE && sib.tagName === node.tagName) idx++; sib = sib.nextSibling; }
    return getXPath(node.parentNode) + '/' + tag + '[' + idx + ']';
  }

  function resolveXPath(xpath) {
    try { return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; }
    catch (e) { return null; }
  }

  // --- Highlight management ---
  var marksByCommentId = {};

  function clearHighlights() {
    Object.keys(marksByCommentId).forEach(function (id) {
      var marks = marksByCommentId[id] || [];
      marks.forEach(function (mark) {
        var parent = mark.parentNode;
        if (!parent) return;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
      });
    });
    marksByCommentId = {};
  }

  function wrapRange(range, commentId, active) {
    var marks = [];
    try {
      var frag = range.cloneContents();
      var hasMultiple = frag.querySelectorAll('*').length > 0 || frag.childNodes.length > 1;
      if (!hasMultiple) {
        var mark = document.createElement('mark');
        mark.className = 'artiline-highlight' + (active ? ' active' : '');
        mark.dataset.commentId = commentId;
        range.surroundContents(mark);
        marks.push(mark);
      } else {
        // Multi-element: wrap each text node leaf
        var walker = document.createTreeWalker(range.cloneContents(), NodeFilter.SHOW_TEXT, null);
        var textNodes = [];
        var n;
        while ((n = walker.nextNode())) textNodes.push(n.nodeValue);
        // Fallback: wrap the whole range in a single mark (may fail for cross-element but covers most cases)
        var mark = document.createElement('mark');
        mark.className = 'artiline-highlight' + (active ? ' active' : '');
        mark.dataset.commentId = commentId;
        try { range.surroundContents(mark); marks.push(mark); } catch(e) {}
      }
    } catch (e) {}
    return marks;
  }

  function applyHighlights(annotations) {
    clearHighlights();
    annotations.forEach(function (ann) {
      if (!ann.anchorXPath || !ann.anchorEndXPath) return;
      var startNode = resolveXPath(ann.anchorXPath);
      var endNode = resolveXPath(ann.anchorEndXPath);
      if (!startNode || !endNode) return;
      try {
        var range = document.createRange();
        range.setStart(startNode, ann.anchorOffset || 0);
        range.setEnd(endNode, ann.anchorEndOffset || 0);
        if (range.collapsed) return;
        var marks = wrapRange(range, ann.commentId, ann.active);
        marksByCommentId[ann.commentId] = marks;
      } catch (e) {}
    });
  }

  function activateAnnotation(commentId) {
    Object.keys(marksByCommentId).forEach(function (id) {
      (marksByCommentId[id] || []).forEach(function (m) {
        if (id === commentId) m.classList.add('active');
        else m.classList.remove('active');
      });
    });
  }

  // --- Inbound messages from parent ---
  window.addEventListener('message', function (e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'HIGHLIGHT_ANNOTATIONS') { applyHighlights(e.data.annotations || []); return; }
    if (e.data.type === 'CLEAR_HIGHLIGHTS') { clearHighlights(); return; }
    if (e.data.type === 'ACTIVATE_ANNOTATION') { activateAnnotation(e.data.commentId); return; }
  });

  // --- Text selection → postMessage ---
  document.addEventListener('mouseup', function () {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.toString().trim()) {
      try { window.parent.postMessage({ type: 'SELECTION_CLEARED' }, origin); } catch(e) {}
      return;
    }
    var range = sel.getRangeAt(0);
    var rect = range.getBoundingClientRect();
    try {
      window.parent.postMessage({
        type: 'TEXT_SELECTION',
        selectedText: sel.toString(),
        anchorXPath: getXPath(sel.anchorNode),
        anchorOffset: sel.anchorOffset,
        anchorEndXPath: getXPath(sel.focusNode),
        anchorEndOffset: sel.focusOffset,
        rectY: rect.top / window.innerHeight,
        rectX: rect.left / window.innerWidth,
      }, origin);
    } catch(e) {}
  }, false);

  // --- Design-click → postMessage (suppress when text is selected) ---
  document.addEventListener('click', function (e) {
    var sel = window.getSelection();
    if (sel && sel.toString().trim()) return;
    var x = e.clientX / window.innerWidth;
    var y = e.clientY / window.innerHeight;
    try {
      window.parent.postMessage({
        type: 'ANNOTATION_CLICK',
        x: x, y: y, width: null, height: null,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }, origin);
    } catch(e) {}
  }, true);
})();
</script>
`;

/**
 * Streams an artifact version's raw content for the viewer iframe (and the edit
 * dialog), so the bytes never enter the page's RSC payload. Re-checks visibility
 * on every request — the same gate as the page (`evaluateAccess`). HTML is served
 * with `Content-Security-Policy: sandbox allow-scripts` so that even if the URL is
 * opened directly it runs in an opaque origin (no access to the app's cookies or
 * DOM), matching the isolation the srcDoc + sandboxed iframe gave before.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const url = new URL(req.url);
  const v = url.searchParams.get("v");
  const pw = url.searchParams.get("pw");
  const download = url.searchParams.get("download") === "1";

  const versionNumber = v ? Number(v) : null;
  const resolved =
    versionNumber != null && Number.isFinite(versionNumber)
      ? await resolveArtifactVersion(slug, versionNumber)
      : await resolveCurrentArtifact(slug);
  if (!resolved) return new Response("Not found", { status: 404 });

  const session = await auth();

  // Download mode: serve the ORIGINAL source as a file attachment, restricted to
  // workspace members (stricter than view access — a public visitor can view but
  // not download). Membership implies view rights for any visibility.
  if (download) {
    const userId = session?.user?.id;
    if (!userId) return new Response("Forbidden", { status: 403 });
    const [member] = await db
      .select({ userId: schema.workspaceMembers.userId })
      .from(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, resolved.artifact.workspaceId),
          eq(schema.workspaceMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!member) return new Response("Forbidden", { status: 403 });

    const source = await getContent(resolved.version);
    const ext = extensionForArtifact(
      resolved.version.type,
      resolved.version.language,
    );
    const name = `${slugify(resolved.version.title) || "artifact"}.${ext}`;
    return new Response(source, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${name}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const access = await evaluateAccess(resolved.artifact, {
    sessionUserId: session?.user?.id ?? null,
    passwordAttempt: pw,
  });
  if (access.kind !== "ok") {
    return new Response("Forbidden", { status: 403 });
  }

  const content = await getContent(resolved.version);
  const isHtml = resolved.version.type === "html";
  const isReact = isReactRenderable(
    resolved.version.type,
    resolved.version.language,
  );
  // React artifacts are wrapped in a self-contained HTML doc that transpiles and
  // mounts the component; both it and HTML are served as a sandboxed document.
  const serveAsDocument = isHtml || isReact;
  let body = isReact ? renderReactWrapper(content) : content;

  if (serveAsDocument) {
    body = body.replace("</body>", ANNOTATION_SCRIPT + "</body>");
  }

  // Cap browser/proxy caching for private artifacts; private content must not be
  // cached by shared caches.
  const isPublic =
    resolved.artifact.visibility === "public" ||
    resolved.artifact.visibility === "public_pw";
  const cache = isPublic
    ? "public, max-age=300"
    : "private, no-store";

  const headers: Record<string, string> = {
    "Content-Type": serveAsDocument
      ? "text/html; charset=utf-8"
      : "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": cache,
  };
  if (serveAsDocument) {
    // Sandbox the document at the HTTP layer so a direct navigation can't run on
    // our origin; allow-scripts keeps interactive artifacts working in the iframe.
    headers["Content-Security-Policy"] = "sandbox allow-scripts";
  } else {
    headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
  }

  return new Response(body, { headers });
}

// Views are recorded by the page, not the raw stream — keep this uncached/dynamic.
export const dynamic = "force-dynamic";

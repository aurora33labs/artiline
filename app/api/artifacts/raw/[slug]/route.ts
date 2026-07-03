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

// Minimal script: reports the iframe document's full height to the parent so
// the iframe element can be sized to its content (no internal iframe scroll).
// Area annotation rects are rendered as overlays on the parent page — the
// iframe just needs to be tall enough that parent-page coords match content coords.
// When prefers-reduced-motion:reduce is active (system setting or browser-enforced
// inside doubly-sandboxed iframes), CSS animations are killed via `animation:none`.
// Artifacts that start elements at opacity:0 and rely on animations to reveal them
// end up permanently blank. This injection restores visibility by overriding opacity
// after the artifact's own stylesheets, so !important here beats their opacity:0.
const REDUCED_MOTION_FALLBACK = `<style>
@media(prefers-reduced-motion:reduce){
  *{opacity:1!important;transform:none!important;visibility:visible!important}
}
</style>`;

const ANNOTATION_SCRIPT = `<script>
(function(){
  // === HEIGHT REPORTING ===
  function report(){
    var h=Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0);
    if(h>0)window.parent.postMessage({type:'IFRAME_HEIGHT',height:h},'*');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',report);
  else report();
  window.addEventListener('load',report);
  var n=0;var iv=setInterval(function(){report();if(++n>=30)clearInterval(iv);},100);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(report).observe(document.documentElement);

  // === ELEMENT INSPECTOR ===
  var inspectMode=false;
  var watchedXPaths=[];
  var overlay=null;

  function getXPath(el){
    if(!el||el.nodeType!==1)return'';
    if(el===document.documentElement)return'/html';
    if(el.id)return'//*[@id="'+el.id+'"]';
    var parts=[];var cur=el;
    while(cur&&cur.nodeType===1&&cur!==document.documentElement){
      var tag=cur.tagName.toLowerCase();var idx=1;var sib=cur.previousSibling;
      while(sib){if(sib.nodeType===1&&sib.tagName===cur.tagName)idx++;sib=sib.previousSibling;}
      parts.unshift(tag+'['+idx+']');cur=cur.parentNode;
    }
    return'/html/'+parts.join('/');
  }

  function getRect(el){
    var r=el.getBoundingClientRect();
    return{top:Math.round(r.top),left:Math.round(r.left),width:Math.round(r.width),height:Math.round(r.height)};
  }

  function ensureOverlay(){
    if(overlay)return overlay;
    overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;pointer-events:none;z-index:99999;box-sizing:border-box;border:2px solid #f97316;background:rgba(249,115,22,0.1);display:none;transition:top 0.08s,left 0.08s,width 0.08s,height 0.08s;';
    document.body.appendChild(overlay);return overlay;
  }
  function showOverlay(el){
    var ov=ensureOverlay();var r=el.getBoundingClientRect();
    ov.style.top=r.top+'px';ov.style.left=r.left+'px';
    ov.style.width=r.width+'px';ov.style.height=r.height+'px';
    ov.style.display='block';
  }
  function hideOverlay(){if(overlay)overlay.style.display='none';}

  document.addEventListener('mouseover',function(e){
    if(!inspectMode)return;
    var el=e.target;
    if(!el||el===document.body||el===document.documentElement||el===overlay)return;
    showOverlay(el);
    window.parent.postMessage({type:'ELEMENT_HOVER',xpath:getXPath(el),rect:getRect(el)},'*');
  },true);

  document.addEventListener('click',function(e){
    if(!inspectMode)return;
    e.preventDefault();e.stopPropagation();
    var el=e.target;
    if(!el||el===document.body||el===document.documentElement||el===overlay)return;
    var xpath=getXPath(el);var rect=getRect(el);
    window.parent.postMessage({type:'ELEMENT_SELECTED',xpath:xpath,rect:rect},'*');
    inspectMode=false;hideOverlay();document.body.style.cursor='';
  },true);

  function resolveXPath(xpath){
    try{
      var r=document.evaluate(xpath,document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null);
      return r.singleNodeValue;
    }catch(e){return null;}
  }

  function reportPositions(){
    if(watchedXPaths.length===0)return;
    var positions=[];
    for(var i=0;i<watchedXPaths.length;i++){
      var item=watchedXPaths[i];var el=resolveXPath(item.xpath);
      if(el)positions.push({commentId:item.commentId,xpath:item.xpath,rect:getRect(el)});
    }
    if(positions.length>0)window.parent.postMessage({type:'ELEMENT_POSITIONS',positions:positions},'*');
  }

  window.addEventListener('message',function(e){
    var msg=e.data;if(!msg||typeof msg!=='object')return;
    if(msg.type==='INSPECT_MODE'){
      inspectMode=!!msg.active;
      document.body.style.cursor=inspectMode?'crosshair':'';
      if(!inspectMode)hideOverlay();
    }
    if(msg.type==='WATCH_XPATHS'){
      watchedXPaths=msg.xpaths||[];
      reportPositions();
    }
  });

  window.addEventListener('scroll',reportPositions,true);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(reportPositions).observe(document.documentElement);
})();
</script>`;

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

  // Un-approved (pending/changes_requested) versions are internal-only: their
  // raw bytes must never reach a public/anonymous visitor, even for a public
  // artifact. A workspace member may still view a proposal (this same route
  // backs the internal deep-link viewer).
  const isApproved = resolved.version.reviewStatus === "approved";
  if (!isApproved) {
    const userId = session?.user?.id;
    const member = userId
      ? (
          await db
            .select({ userId: schema.workspaceMembers.userId })
            .from(schema.workspaceMembers)
            .where(
              and(
                eq(
                  schema.workspaceMembers.workspaceId,
                  resolved.artifact.workspaceId,
                ),
                eq(schema.workspaceMembers.userId, userId),
              ),
            )
            .limit(1)
        )[0]
      : null;
    if (!member) return new Response("Forbidden", { status: 403 });
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
    // Case-insensitive match + fallback append for HTML fragments without </body>
    const inject = REDUCED_MOTION_FALLBACK + ANNOTATION_SCRIPT;
    if (/<\/body>/i.test(body)) {
      body = body.replace(/<\/body>/i, inject + "</body>");
    } else {
      body = body + inject;
    }
  }

  // Cap browser/proxy caching for private artifacts; private content must not be
  // cached by shared caches.
  const isPublic =
    resolved.artifact.visibility === "public" ||
    resolved.artifact.visibility === "public_pw";
  // A versioned request (`?v=N`) is immutable content at a unique URL, so a
  // strictly-public one can be cached hard — new versions get a new URL and bust
  // it. Password-gated (`public_pw`) is never cached long by shared caches, and
  // internal stays uncached.
  const cache = !isApproved
    ? // Never let a shared cache hold an un-approved proposal.
      "private, no-store"
    : versionNumber != null && resolved.artifact.visibility === "public"
      ? "public, max-age=31536000, immutable"
      : isPublic
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
    // frame-ancestors * is required here (not restricted via next.config headers())
    // because when /embed/[slug] is itself embedded in a third-party site, this
    // raw document sits one level deeper in that same external ancestor chain.
    headers["Content-Security-Policy"] = "sandbox allow-scripts; frame-ancestors *";
  } else {
    headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
  }

  return new Response(body, { headers });
}

// Views are recorded by the page, not the raw stream — keep this uncached/dynamic.
export const dynamic = "force-dynamic";

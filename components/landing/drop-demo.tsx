"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, FileCode2, Hash, Upload } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import Link from "next/link";
import { detectArtifact, type ArtifactType } from "@/lib/detect-artifact";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 100_000;
/** Logical render width for HTML artifacts; scaled down to fit the preview box. */
const LOGICAL_WIDTH = 1280;

/**
 * Strings are passed in from the server component so all copy stays in the
 * next-intl message catalog (this is a client component).
 */
export type DropDemoStrings = {
  placeholder: string;
  hint: string;
  drop: string;
  dropTitle: string;
  dropBrowse: string;
  dropPaste: string;
  dropBack: string;
  viewPreview: string;
  viewCode: string;
  tryExample: string;
  previewEmpty: string;
  tooBig: string;
  externalBlocked: string;
  lockedLink: string;
  lockedCta: string;
  ephemeral: string;
  typeLabel: Record<ArtifactType, string>;
};

// All examples are fully self-contained: inline CSS/JS, system fonts, inline
// SVG/canvas, no network. The preview sandbox CSP (default-src 'none') blocks
// every external resource, so anything that phones home would render blank.
const EXAMPLES: { name: string; body: string }[] = [
  {
    name: "web.html",
    body: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 *{margin:0;box-sizing:border-box}
 body{font-family:system-ui,sans-serif;background:radial-gradient(120% 120% at 50% 0%,#1b1140,#0a0a12 55%);color:#f4f1ff;min-height:100vh}
 .wrap{max-width:1040px;margin:0 auto;padding:26px 32px}
 nav{display:flex;align-items:center;justify-content:space-between}
 .logo{font-weight:800;letter-spacing:-.02em;font-size:18px}.logo i{color:#a78bfa;font-style:normal}
 .links{display:flex;gap:22px;font-size:14px;color:#b9b3d6;align-items:center}
 .links a{color:inherit;text-decoration:none}
 .pill{border:1px solid #ffffff22;border-radius:999px;padding:8px 16px;font-weight:600}
 .hero{text-align:center;padding:92px 0 30px}
 .badge{display:inline-block;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#c4b5fd;border:1px solid #ffffff22;border-radius:999px;padding:6px 14px;margin-bottom:26px}
 h1{font-size:clamp(34px,6vw,64px);line-height:1.04;letter-spacing:-.03em;font-weight:800;background:linear-gradient(180deg,#fff,#c9c2ec);-webkit-background-clip:text;background-clip:text;color:transparent}
 .sub{margin:22px auto 0;max-width:44ch;font-size:18px;line-height:1.6;color:#bcb6da}
 .cta{margin-top:34px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
 .btn{padding:14px 26px;border-radius:12px;font-weight:700;font-size:15px;border:0;cursor:pointer}
 .btn.p{background:linear-gradient(135deg,#8b5cf6,#6366f1);color:#fff;box-shadow:0 14px 44px -12px #8b5cf6}
 .btn.g{background:#ffffff10;color:#fff;border:1px solid #ffffff22}
 .stats{display:flex;gap:46px;justify-content:center;margin-top:72px;flex-wrap:wrap}
 .stat b{display:block;font-size:30px;font-weight:800}.stat span{font-size:13px;color:#9d97bd}
</style></head>
<body><div class="wrap">
 <nav><div class="logo">north<i>.</i></div><div class="links"><a>Product</a><a>Pricing</a><a>Docs</a><span class="pill">Sign in</span></div></nav>
 <section class="hero">
  <span class="badge">New · v2 is live</span>
  <h1>Ship faster than<br>your roadmap.</h1>
  <p class="sub">The workspace where product, design, and engineering move as one. No more status meetings.</p>
  <div class="cta"><button class="btn p">Start free</button><button class="btn g">Watch demo</button></div>
  <div class="stats"><div class="stat"><b>12k+</b><span>teams onboard</span></div><div class="stat"><b>4.9</b><span>avg rating</span></div><div class="stat"><b>99.9%</b><span>uptime</span></div></div>
 </section>
</div></body></html>`,
  },
  {
    name: "dashboard.html",
    body: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 *{margin:0;box-sizing:border-box}
 body{font-family:system-ui,sans-serif;background:#f4f5f7;color:#1c1d22}
 .app{display:grid;grid-template-columns:210px 1fr;min-height:100vh}
 .side{background:#0f1115;color:#cdd0d6;padding:22px 16px}
 .brand{font-weight:800;color:#fff;font-size:16px;margin-bottom:26px;display:flex;align-items:center;gap:8px}
 .dot{width:10px;height:10px;border-radius:3px;background:#5b8cff}
 .nav a{display:flex;gap:10px;padding:9px 12px;border-radius:8px;color:#9aa0ab;text-decoration:none;font-size:14px;margin-bottom:2px}
 .nav a.on{background:#1b1f27;color:#fff}
 main{padding:26px 30px}
 .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}
 h1{font-size:22px;letter-spacing:-.02em}.muted{color:#7b8190;font-size:13px}
 .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:14px}
 .card{background:#fff;border:1px solid #e7e9ee;border-radius:14px;padding:16px}
 .card .k{font-size:11px;color:#7b8190;text-transform:uppercase;letter-spacing:.06em}
 .card .v{font-size:26px;font-weight:800;margin:8px 0 4px;letter-spacing:-.02em}
 .up{color:#16a34a;font-size:12px;font-weight:700}.down{color:#dc2626;font-size:12px;font-weight:700}
 .grid2{display:grid;grid-template-columns:1.6fr 1fr;gap:14px}
 .panel{background:#fff;border:1px solid #e7e9ee;border-radius:14px;padding:18px}
 .panel h3{font-size:14px;margin-bottom:14px}
 table{width:100%;border-collapse:collapse;font-size:13px}
 td,th{text-align:left;padding:9px 6px;border-bottom:1px solid #eef0f4}
 th{color:#7b8190;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
 .tag{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px}
 .paid{background:#dcfce7;color:#15803d}.pend{background:#fef9c3;color:#a16207}
</style></head>
<body><div class="app">
 <aside class="side"><div class="brand"><span class="dot"></span>Pulse</div>
  <nav class="nav"><a class="on">Overview</a><a>Analytics</a><a>Reports</a><a>Customers</a><a>Settings</a></nav></aside>
 <main>
  <div class="top"><div><h1>Overview</h1><div class="muted">Last 30 days</div></div><div class="muted">Mara R.</div></div>
  <div class="cards">
   <div class="card"><div class="k">Revenue</div><div class="v">$48.2k</div><span class="up">+12.4%</span></div>
   <div class="card"><div class="k">Users</div><div class="v">9,310</div><span class="up">+7.1%</span></div>
   <div class="card"><div class="k">Churn</div><div class="v">1.8%</div><span class="down">-0.3%</span></div>
   <div class="card"><div class="k">MRR</div><div class="v">$12.7k</div><span class="up">+4.9%</span></div>
  </div>
  <div class="grid2">
   <div class="panel"><h3>Revenue trend</h3>
    <svg viewBox="0 0 520 200" width="100%" height="190"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b8cff" stop-opacity=".35"/><stop offset="1" stop-color="#5b8cff" stop-opacity="0"/></linearGradient></defs>
     <path d="M0,150 65,120 130,135 195,90 260,100 325,55 390,70 455,35 520,48 L520,200 0,200Z" fill="url(#g)"/>
     <path d="M0,150 65,120 130,135 195,90 260,100 325,55 390,70 455,35 520,48" fill="none" stroke="#5b8cff" stroke-width="2.5"/></svg></div>
   <div class="panel"><h3>By channel</h3>
    <svg viewBox="0 0 240 200" width="100%" height="190"><rect x="20" y="80" width="34" height="100" rx="5" fill="#9fb6ff"/><rect x="74" y="50" width="34" height="130" rx="5" fill="#7c5cff"/><rect x="128" y="110" width="34" height="70" rx="5" fill="#9fb6ff"/><rect x="182" y="30" width="34" height="150" rx="5" fill="#3b6fe0"/></svg></div>
  </div>
  <div class="panel" style="margin-top:14px"><h3>Recent invoices</h3>
   <table><tr><th>Customer</th><th>Plan</th><th>Amount</th><th>Status</th></tr>
    <tr><td>Acme Inc</td><td>Scale</td><td>$1,200</td><td><span class="tag paid">Paid</span></td></tr>
    <tr><td>Globex</td><td>Pro</td><td>$480</td><td><span class="tag pend">Pending</span></td></tr>
    <tr><td>Initech</td><td>Scale</td><td>$1,200</td><td><span class="tag paid">Paid</span></td></tr></table></div>
 </main>
</div></body></html>`,
  },
  {
    name: "pricing.html",
    body: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 *{margin:0;box-sizing:border-box}
 body{font-family:system-ui,sans-serif;background:#0b0c10;color:#e8eaf0;min-height:100vh;display:grid;place-items:center;padding:42px 20px}
 .wrap{width:100%;max-width:980px;text-align:center}
 h1{font-size:clamp(28px,5vw,44px);letter-spacing:-.03em;font-weight:800}.sub{color:#9aa0ab;margin-top:12px}
 .toggle{display:inline-flex;background:#16181f;border:1px solid #262a33;border-radius:999px;padding:4px;margin:28px 0 34px;gap:4px}
 .toggle button{border:0;background:transparent;color:#9aa0ab;padding:9px 20px;border-radius:999px;font-weight:700;font-size:14px;cursor:pointer}
 .toggle button.on{background:#fff;color:#0b0c10}
 .tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
 .tier{background:#111319;border:1px solid #262a33;border-radius:18px;padding:26px;text-align:left}
 .tier.pop{border-color:#7c5cff;box-shadow:0 0 0 1px #7c5cff,0 26px 60px -32px #7c5cff}
 .name{font-weight:700;font-size:13px;color:#c4b5fd;letter-spacing:.05em;text-transform:uppercase}
 .price{font-size:42px;font-weight:800;letter-spacing:-.03em;margin:14px 0 2px}.price small{font-size:15px;color:#9aa0ab;font-weight:600}
 ul{list-style:none;margin:18px 0}li{padding:8px 0;color:#c3c8d4;font-size:14px;display:flex;gap:10px}li::before{content:"+";color:#7c5cff;font-weight:800}
 .buy{width:100%;margin-top:8px;padding:12px;border-radius:11px;border:0;font-weight:700;cursor:pointer;background:#1c1f27;color:#fff}
 .tier.pop .buy{background:linear-gradient(135deg,#8b5cf6,#6366f1)}
</style></head>
<body><div class="wrap">
 <h1>Pricing that scales with you</h1><p class="sub">Start free. Upgrade when your team grows.</p>
 <div class="toggle"><button id="m" class="on" onclick="setP(0)">Monthly</button><button id="y" onclick="setP(1)">Yearly -20%</button></div>
 <div class="tiers">
  <div class="tier"><div class="name">Starter</div><div class="price">$0</div><ul><li>3 projects</li><li>Community support</li><li>1 GB storage</li></ul><button class="buy">Get started</button></div>
  <div class="tier pop"><div class="name">Pro</div><div class="price" data-m="$24" data-y="$19"><span class="amt">$24</span><small>/mo</small></div><ul><li>Unlimited projects</li><li>Priority support</li><li>100 GB storage</li><li>Advanced analytics</li></ul><button class="buy">Start trial</button></div>
  <div class="tier"><div class="name">Scale</div><div class="price" data-m="$80" data-y="$64"><span class="amt">$80</span><small>/mo</small></div><ul><li>SSO + audit log</li><li>Dedicated manager</li><li>1 TB storage</li></ul><button class="buy">Contact sales</button></div>
 </div>
</div>
<script>
 function setP(y){
  document.getElementById('m').classList.toggle('on',!y);
  document.getElementById('y').classList.toggle('on',!!y);
  var n=document.querySelectorAll('.amt');
  for(var i=0;i<n.length;i++){var p=n[i].parentElement;n[i].textContent=y?p.dataset.y:p.dataset.m;}
 }
</script></body></html>`,
  },
  {
    name: "orbit.html",
    body: `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#05060a;overflow:hidden}canvas{display:block}
 .cap{position:fixed;left:24px;bottom:20px;font-family:system-ui,sans-serif;color:#8b93a7;font-size:13px;letter-spacing:.04em}.cap b{color:#e8eaf0}</style></head>
<body><canvas id="c"></canvas><div class="cap"><b>flow field</b> &middot; move your cursor</div>
<script>
 var c=document.getElementById('c'),x=c.getContext('2d'),w,h,t=0,mx=.5,my=.5;
 function size(){w=c.width=innerWidth;h=c.height=innerHeight;}
 addEventListener('resize',size);size();
 addEventListener('pointermove',function(e){mx=e.clientX/w;my=e.clientY/h;});
 var N=110,p=[];for(var i=0;i<N;i++)p.push({a:i/N*Math.PI*2,r:70+i*1.9});
 function loop(){
  t+=0.012;x.fillStyle='rgba(5,6,10,0.12)';x.fillRect(0,0,w,h);
  for(var i=0;i<N;i++){var o=p[i],a=o.a+t+Math.sin(t+i*0.1)*0.7;
   var cx=w*mx+Math.cos(a)*o.r,cy=h*my+Math.sin(a)*o.r*0.62;
   x.beginPath();x.arc(cx,cy,2.6,0,7);x.fillStyle='hsl('+((i*3+t*40)%360)+',92%,64%)';x.fill();}
  requestAnimationFrame(loop);
 }
 loop();
</script></body></html>`,
  },
  {
    name: "data.md",
    body: `# Weekly Metrics — Week 23

**Owner:** growth team · **Status:** on track

> TL;DR: signups up **18%** WoW, activation steady, churn down for the third week.

## Highlights

- New signups crossed **2,400** (best week this quarter)
- Activation rate held at **62%**
- Enterprise pipeline added **3** logos

## Funnel

| Stage | This week | Last week | Δ |
|---|---:|---:|---:|
| Visitors | 48,200 | 41,900 | +15% |
| Signups | 2,412 | 2,044 | +18% |
| Activated | 1,495 | 1,287 | +16% |
| Paid | 188 | 171 | +10% |

## Next steps

1. Ship the referral loop
2. A/B test the onboarding checklist
3. Open the EU region waitlist

\`\`\`sql
select date_trunc('week', created_at) as wk, count(*)
from signups group by 1 order by 1 desc limit 4;
\`\`\`

---

*Generated automatically · do not edit by hand.*`,
  },
  {
    name: "useChat.ts",
    body: `import { useCallback, useRef, useState } from "react";

export type Message = { id: string; role: "user" | "assistant"; text: string };

type Options = { endpoint?: string; model?: string };

/** Streaming chat hook with optimistic UI and abort support. */
export function useChat({ endpoint = "/api/chat", model = "opus" }: Options = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string) => {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text }]);
      setPending(true);
      ctrl.current?.abort();
      ctrl.current = new AbortController();

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, text }),
        signal: ctrl.current.signal,
      });
      if (!res.body) throw new Error("no stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const reply: Message = { id: crypto.randomUUID(), role: "assistant", text: "" };
      setMessages((m) => [...m, reply]);

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.text += decoder.decode(value, { stream: true });
        setMessages((m) => m.map((x) => (x.id === reply.id ? { ...reply } : x)));
      }
      setPending(false);
    },
    [endpoint, model],
  );

  return { messages, pending, send, stop: () => ctrl.current?.abort() };
}`,
  },
  {
    name: "rate_limiter.py",
    body: `import time
from dataclasses import dataclass, field


@dataclass
class TokenBucket:
    """A token-bucket rate limiter.

    rate:     tokens refilled per second
    capacity: maximum tokens the bucket holds
    """

    rate: float
    capacity: float
    _tokens: float = field(default=0.0, init=False)
    _last: float = field(default_factory=time.monotonic, init=False)

    def __post_init__(self) -> None:
        self._tokens = self.capacity

    def allow(self, cost: float = 1.0) -> bool:
        now = time.monotonic()
        elapsed = now - self._last
        self._tokens = min(self.capacity, self._tokens + elapsed * self.rate)
        self._last = now
        if self._tokens >= cost:
            self._tokens -= cost
            return True
        return False


if __name__ == "__main__":
    bucket = TokenBucket(rate=5, capacity=10)
    granted = sum(bucket.allow() for _ in range(14))
    print(f"granted {granted}/14 requests")`,
  },
];

function buildSrcDoc(html: string): string {
  // CSP must be the first thing the parser sees. default-src 'none' blocks all
  // network (fetch/XHR/websocket/external scripts); inline styles + scripts are
  // allowed so the artifact runs, but the sandbox iframe has no allow-same-origin
  // so it cannot reach our origin, cookies, or the parent document.
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'">`;
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${csp}`);
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${csp}</head>`);
  }
  return `<!doctype html><html><head>${csp}<meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}body{font-family:system-ui,sans-serif;color:inherit}</style></head><body>${html}</body></html>`;
}

const REFERENCES_EXTERNAL =
  /<script[^>]+src=|<link[^>]+href=|@import|https?:\/\/(?!localhost)/i;

const PREVIEW_HEIGHT = "clamp(360px, 58vh, 620px)";

export function DropDemo({
  s,
  autoload,
}: {
  s: DropDemoStrings;
  /** Index into EXAMPLES to load on mount (hero plays a pre-filled artifact). */
  autoload?: number;
}) {
  // Hero can seed an example so the first paint shows a rendered artifact.
  const seed = autoload != null ? EXAMPLES[autoload] : undefined;
  const [value, setValue] = useState(seed?.body ?? "");
  const [filename, setFilename] = useState(seed?.name ?? "");
  const [dragging, setDragging] = useState(false);
  const [opened, setOpened] = useState(seed != null); // left the dropzone
  const [view, setView] = useState<"preview" | "code">("preview");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Drop zone is the empty state; once there's content (or the user opts to
  // type), we switch to the loaded workspace with a dominant preview.
  const loaded = opened || value.length > 0;

  const tooBig = value.length > MAX_BYTES;
  const detection = useMemo(
    () => (value.trim() ? detectArtifact(filename, value) : null),
    [value, filename],
  );
  const detected = detection?.type ?? null;
  const language = detection?.language ?? "text";

  const mockNumber = useMemo(
    () => String(10 + (value.length % 89)).padStart(3, "0"),
    [value.length],
  );

  // Measure the preview box so HTML artifacts render at a real logical width
  // (1280px) and scale down to fit, instead of cramming into a small frame.
  const previewRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setBox({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded, view]);
  const scale = box.w ? Math.min(box.w / LOGICAL_WIDTH, 1) : 1;

  const loadExample = useCallback((i: number) => {
    const ex = EXAMPLES[i];
    setFilename(ex.name);
    setValue(ex.body);
    setOpened(true);
    setView("preview");
  }, []);

  const readFile = useCallback(async (file: File) => {
    const text = await file.text();
    setFilename(file.name);
    setValue(text.slice(0, MAX_BYTES + 1));
    setOpened(true);
    setView("preview");
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        await readFile(file);
        return;
      }
      // Some sources drag plain text rather than a file.
      const text = e.dataTransfer.getData("text");
      if (text) {
        setFilename("");
        setValue(text.slice(0, MAX_BYTES + 1));
        setOpened(true);
        setView("preview");
      }
    },
    [readFile],
  );

  const pasteText = useCallback((text: string) => {
    setValue(text.slice(0, MAX_BYTES + 1));
    setOpened(true);
    setView("preview");
  }, []);

  const openEditor = useCallback(() => {
    setOpened(true);
    setView("code");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const reset = useCallback(() => {
    setValue("");
    setFilename("");
    setOpened(false);
    setView("preview");
  }, []);

  const referencesExternal =
    detected === "html" && REFERENCES_EXTERNAL.test(value);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);

  return (
    <div className="flex flex-col bg-background">
      {/* Hidden file picker — dropzone + "browse" trigger it (mobile fallback). */}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) readFile(f);
          e.target.value = "";
        }}
      />

      {loaded ? (
        <>
          {/* Toolbar — filename, type, view toggle, reset */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="meta truncate">
                {filename ? filename.toUpperCase() : "PREVIEW"}
              </span>
              {detected && (
                <span className="meta text-primary">{s.typeLabel[detected]}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex items-center rounded-sm border border-border-strong p-0.5">
                <ViewTab
                  active={view === "preview"}
                  onClick={() => setView("preview")}
                >
                  {s.viewPreview}
                </ViewTab>
                <ViewTab active={view === "code"} onClick={() => setView("code")}>
                  {s.viewCode}
                </ViewTab>
              </div>
              <Button
                size="xs"
                variant="ghost"
                className="gap-1"
                onClick={reset}
              >
                <Upload className="size-3" aria-hidden />
                {s.dropBack}
              </Button>
            </div>
          </div>

          {/* Big area — preview (dominant) or code editor */}
          {view === "code" ? (
            <>
              <label htmlFor="drop-input" className="sr-only">
                {s.placeholder}
              </label>
              <textarea
                id="drop-input"
                ref={inputRef}
                value={value}
                spellCheck={false}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (filename) setFilename("");
                }}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                placeholder={s.placeholder}
                style={{ height: PREVIEW_HEIGHT }}
                className={`block w-full resize-none bg-transparent px-4 py-4 font-mono text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/60 ${
                  dragging ? "ring-2 ring-inset ring-primary" : ""
                }`}
              />
            </>
          ) : (
            <div
              ref={previewRef}
              style={{ height: PREVIEW_HEIGHT }}
              className="relative overflow-hidden"
            >
              {tooBig ? (
                <Empty>{s.tooBig}</Empty>
              ) : !detected ? (
                <Empty>{s.previewEmpty}</Empty>
              ) : detected === "html" ? (
                <iframe
                  title="preview"
                  sandbox="allow-scripts"
                  srcDoc={buildSrcDoc(value)}
                  style={{
                    width: `${LOGICAL_WIDTH}px`,
                    height: scale ? `${box.h / scale}px` : "100%",
                    transform: `scale(${scale})`,
                    transformOrigin: "0 0",
                  }}
                  className="absolute left-0 top-0 border-0 bg-white"
                />
              ) : detected === "markdown" ? (
                <div className="md-preview h-full overflow-auto bg-background px-6 py-5 text-base">
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                  >
                    {value}
                  </Markdown>
                </div>
              ) : (
                <CodePreview key={filename + value.length} code={value} lang={language} />
              )}
            </div>
          )}

          {referencesExternal && !tooBig && view === "preview" && (
            <p className="border-t border-border px-3 py-2 text-xs leading-snug text-muted-foreground">
              {s.externalBlocked}
            </p>
          )}

          {/* Locked link card — the payoff */}
          <div className="flex items-center gap-3 border-t border-border bg-surface px-3 py-2.5">
            <Lock className="size-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="meta">{s.lockedLink}</div>
              <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                <Hash className="size-3" aria-hidden />
                <span className="tabular-nums">{mockNumber}</span>
                <span className="select-none blur-[3px]">artiline.app/a/x7k2qd</span>
              </div>
            </div>
            <Button asChild size="sm">
              <Link href="/signup">{s.lockedCta}</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Empty state — drag-and-drop first, click-to-browse + paste fallbacks */}
          <div
            role="button"
            tabIndex={0}
            aria-label={s.dropTitle}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (text) pasteText(text);
            }}
            style={{ height: "clamp(320px, 40vh, 460px)" }}
            className="group/drop flex cursor-pointer p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-6"
          >
            {/* Dashed drop target */}
            <div
              className={`flex h-full w-full flex-col items-center justify-center gap-5 rounded-lg border-2 border-dashed px-6 text-center transition-colors duration-150 ${
                dragging
                  ? "border-primary bg-accent-tint"
                  : "border-border-strong group-hover/drop:border-primary/60 group-hover/drop:bg-surface/60"
              }`}
            >
              <span
                className={`flex size-16 items-center justify-center rounded-lg border transition-colors duration-150 ${
                  dragging
                    ? "border-primary bg-primary/15"
                    : "border-border-strong bg-surface group-hover/drop:border-primary/60"
                }`}
              >
                <Upload
                  className={`size-7 text-primary transition-transform duration-150 ${dragging ? "-translate-y-0.5" : "group-hover/drop:-translate-y-0.5"}`}
                  strokeWidth={1.5}
                  aria-hidden
                />
              </span>
              <div className="space-y-1.5">
                <p className="max-w-[32ch] text-base font-medium">{s.dropTitle}</p>
                <p className="meta">{s.drop}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileRef.current?.click();
                  }}
                >
                  {s.dropBrowse}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditor();
                  }}
                >
                  {s.dropPaste}
                </Button>
              </div>
            </div>
          </div>

          {/* Examples */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
            <span className="meta mr-1">{s.tryExample}</span>
            {EXAMPLES.map((ex, i) => (
              <Button
                key={ex.name}
                size="xs"
                variant="secondary"
                className="border border-border-strong font-mono"
                onClick={() => loadExample(i)}
              >
                {ex.name}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Syntax-highlighted code preview. Shiki is dynamic-imported so it only loads
 * (as a separate chunk) when a code artifact is actually viewed, keeping the
 * landing's initial bundle lean. Falls back to plain mono while it loads.
 */
function CodePreview({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    let alive = true;
    import("shiki")
      .then(({ codeToHtml }) =>
        codeToHtml(code, { lang, theme: "github-dark-default" }),
      )
      .then((out) => {
        if (alive) setHtml(out);
      })
      .catch(() => {
        // Unknown language or load failure — keep the plain fallback.
      });
    return () => {
      alive = false;
    };
  }, [code, lang]);

  if (!html) {
    return (
      <pre className="h-full overflow-auto bg-[#0d1117] px-6 py-5 font-mono text-sm leading-relaxed text-[#e6edf3]">
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="h-full overflow-auto font-mono text-sm leading-relaxed [&>pre]:!m-0 [&>pre]:min-h-full [&>pre]:px-6 [&>pre]:py-5"
      // Shiki output is sanitized HTML it generated from the code string.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-[2px] px-2 py-0.5 text-[0.75rem] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "bg-surface-2 text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <FileCode2 className="size-6 text-muted-foreground/40" aria-hidden />
      <p className="max-w-[28ch] text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

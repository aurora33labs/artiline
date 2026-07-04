import "server-only";
import { XPATH_HELPERS_SRC } from "@/lib/annotation-script";

/**
 * Standalone vanilla-JS widget served at /review.js (see app/review.js/route.ts)
 * for teams reviewing a site they don't host on Artiline. No build step, no
 * bundler — it's a single self-contained IIFE, same philosophy as
 * ANNOTATION_SCRIPT. Everything defensive: a failure here must never break the
 * host page, so every entry point is wrapped in try/catch and the widget
 * unmounts silently on any unexpected error.
 */
export const REVIEW_WIDGET_SOURCE = `(function(){
  try {
    var CUR = document.currentScript;
    if (!CUR) return;
    var KEY = CUR.getAttribute('data-key');
    if (!KEY) return;
    var API = new URL(CUR.src).origin;
    var NAME_KEY = 'artl-review-name';

    ${XPATH_HELPERS_SRC}

    function fnv1a(str){
      var h = 0x811c9dc5;
      for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h + ((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24))) >>> 0;
      }
      return h.toString(16);
    }

    function pageHash(){
      var text = (document.body ? document.body.innerText : '') || '';
      return fnv1a(text.replace(/\\s+/g, ' ').trim());
    }

    function currentPath(){ return location.pathname; }

    function post(path, body){
      return fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
    }

    function get(path, params){
      var qs = Object.keys(params).map(function(k){
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');
      return fetch(API + path + '?' + qs).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
    }

    // === Ping: report this page + its content hash, once per load (settled) ===
    setTimeout(function(){
      post('/api/review/ping', {
        key: KEY, path: currentPath(), hash: pageHash(), title: document.title,
      });
    }, 1000);

    // === UI: floating toggle button ===
    var css = document.createElement('style');
    css.textContent =
      '.artl-btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:48px;height:48px;' +
      'border-radius:8px;background:#111;color:#fff;border:none;cursor:pointer;font:14px sans-serif;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center}' +
      '.artl-btn.active{background:#f97316}' +
      '.artl-hover{position:fixed;pointer-events:none;z-index:2147482998;border:2px solid #f97316;' +
      'background:rgba(249,115,22,.1);box-sizing:border-box;display:none}' +
      '.artl-form{position:fixed;z-index:2147483001;background:#fff;color:#111;border:1px solid #ddd;' +
      'border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.2);padding:12px;width:260px;font:13px sans-serif}' +
      '.artl-form input,.artl-form textarea{width:100%;box-sizing:border-box;margin-top:6px;padding:6px;' +
      'border:1px solid #ccc;border-radius:4px;font:inherit}' +
      '.artl-form button{margin-top:8px;padding:6px 12px;border-radius:4px;border:none;background:#111;' +
      'color:#fff;cursor:pointer;font:inherit}' +
      '.artl-pin{position:fixed;z-index:2147482999;width:22px;height:22px;border-radius:50% 50% 50% 0;' +
      'background:#f97316;color:#fff;font:11px sans-serif;display:flex;align-items:center;justify-content:center;' +
      'transform:rotate(45deg) translate(-50%,-100%);cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.3)}' +
      '.artl-pin span{transform:rotate(-45deg)}';
    document.head.appendChild(css);

    var btn = document.createElement('button');
    btn.className = 'artl-btn';
    btn.setAttribute('aria-label', 'Review this page');
    btn.textContent = '💬';
    document.body.appendChild(btn);

    var hoverBox = document.createElement('div');
    hoverBox.className = 'artl-hover';
    document.body.appendChild(hoverBox);

    var active = false;
    var pins = [];

    function clearPins(){
      pins.forEach(function(p){ p.remove(); });
      pins = [];
    }

    function renderPins(list){
      clearPins();
      (list || []).forEach(function(item, i){
        var el = item.anchorXPath ? resolveXPath(item.anchorXPath) : null;
        var rect = el ? getRect(el) : { top: (item.y||0)*window.innerHeight, left: (item.x||0)*window.innerWidth };
        var pin = document.createElement('div');
        pin.className = 'artl-pin';
        pin.style.top = rect.top + 'px';
        pin.style.left = rect.left + 'px';
        if (item.stale) pin.style.background = '#a3a3a3';
        var label = document.createElement('span');
        label.textContent = String(i + 1);
        pin.appendChild(label);
        document.body.appendChild(pin);
        pins.push(pin);
      });
    }

    function loadPins(){
      get('/api/review/comments', { key: KEY, path: currentPath() }).then(function(res){
        if (res && res.pins) renderPins(res.pins);
      });
    }
    loadPins();

    function showForm(x, y, targetType, anchorXPath){
      var form = document.createElement('div');
      form.className = 'artl-form';
      form.style.top = Math.min(y, window.innerHeight - 200) + 'px';
      form.style.left = Math.min(x, window.innerWidth - 280) + 'px';
      // Built with literal markup only (no interpolated strings) — the saved
      // name is set via the value property below, never parsed as HTML.
      form.innerHTML =
        '<input type="text" placeholder="Your name" class="artl-name">' +
        '<textarea rows="3" placeholder="Comment" class="artl-body"></textarea>' +
        '<button type="button" class="artl-submit">Send</button>' +
        '<button type="button" class="artl-cancel" style="background:#eee;color:#111;margin-left:6px">Cancel</button>';
      document.body.appendChild(form);
      try {
        var savedName = localStorage.getItem(NAME_KEY) || '';
        form.querySelector('.artl-name').value = savedName;
      } catch(e){}

      form.querySelector('.artl-cancel').addEventListener('click', function(){ form.remove(); });
      form.querySelector('.artl-submit').addEventListener('click', function(){
        var name = form.querySelector('.artl-name').value.trim();
        var body = form.querySelector('.artl-body').value.trim();
        if (!body) return;
        try { if (name) localStorage.setItem(NAME_KEY, name); } catch(e){}
        post('/api/review/comments', {
          key: KEY, path: currentPath(), hash: pageHash(),
          body: body, authorName: name || 'Anonymous',
          targetType: targetType, anchorXPath: anchorXPath || null,
          x: x / window.innerWidth, y: y / window.innerHeight,
        }).then(function(){ form.remove(); loadPins(); });
      });
    }

    function onMouseMove(e){
      if (!active) return;
      var el = e.target;
      if (!el || el === document.body || el === document.documentElement ||
          el.closest('.artl-btn,.artl-form,.artl-hover,.artl-pin')) {
        hoverBox.style.display = 'none';
        return;
      }
      var r = el.getBoundingClientRect();
      hoverBox.style.display = 'block';
      hoverBox.style.top = r.top + 'px';
      hoverBox.style.left = r.left + 'px';
      hoverBox.style.width = r.width + 'px';
      hoverBox.style.height = r.height + 'px';
    }

    function onClick(e){
      if (!active) return;
      var el = e.target;
      if (el.closest('.artl-btn,.artl-form,.artl-hover,.artl-pin')) return;
      e.preventDefault(); e.stopPropagation();
      var xpath = getXPath(el);
      showForm(e.clientX, e.clientY, 'element', xpath);
      active = false; btn.classList.remove('active'); hoverBox.style.display = 'none';
    }

    btn.addEventListener('click', function(){
      active = !active;
      btn.classList.toggle('active', active);
      if (!active) hoverBox.style.display = 'none';
    });
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
  } catch (e) {
    // Never let a widget failure break the host page.
  }
})();`;

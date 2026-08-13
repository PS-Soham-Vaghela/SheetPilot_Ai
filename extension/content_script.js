/**
 * content_script.js — SheetPilot AI floating overlay (clean rewrite)
 * Injected into every page. Toolbar icon click toggles the widget.
 */
(function () {
  "use strict";

  let BACKEND      = "http://127.0.0.1:8000";
  const ROOT_ID    = "sheetpilot-root";

  // ── Guard: already injected → just toggle ────────────────────────────────
  if (document.getElementById(ROOT_ID)) {
    const w = document.getElementById("sp-widget");
    if (w) w.style.display = w.style.display === "none" ? "flex" : "none";
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STYLES
  // ─────────────────────────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
  /* ── Root container ── */
  #sheetpilot-root{
    position:fixed;top:0;left:0;width:0;height:0;
    pointer-events:none;z-index:2147483647;overflow:visible;
  }

  /* ── Widget shell ── */
  #sp-widget{
    pointer-events:auto;
    position:fixed;
    width:360px;
    max-height:90vh;
    display:flex;flex-direction:column;
    border-radius:16px;
    overflow:hidden;
    font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;font-size:13px;
    color:#111827;
    user-select:none;
    background:#ffffff;
    border:1px solid #e5e7eb;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06),
      0 10px 15px -3px rgba(0, 0, 0, 0.1);
    transition:box-shadow 0.3s ease, opacity 0.2s ease;
    will-change:transform;
  }
  #sp-widget.sp-dragging{
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.15),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
    transition:none;
  }
  #sp-widget.sp-minimized #sp-cfg,
  #sp-widget.sp-minimized #sp-act,
  #sp-widget.sp-minimized #sp-body,
  #sp-widget.sp-minimized #sp-bar{
    display:none !important;
  }

  /* ── Full-page drag capture overlay ── */
  #sp-drag-cap{
    display:none;position:fixed;inset:0;
    z-index:2147483646;cursor:grabbing;pointer-events:auto;
  }

  /* ── Header / drag handle ── */
  #sp-hdr{
    display:flex;align-items:center;gap:9px;padding:12px 14px;
    cursor:grab;
    background:#ffffff;
    border-bottom:1px solid #e5e7eb;
    flex-shrink:0;
  }
  #sp-hdr:active{cursor:grabbing;}

  /* Grip affordance */
  #sp-grip{
    display:flex;flex-direction:column;gap:3px;flex-shrink:0;
    opacity:0.25;pointer-events:none;
  }
  #sp-grip span{
    display:flex;gap:3px;
  }
  #sp-grip span::before,
  #sp-grip span::after{
    content:'';width:3px;height:3px;border-radius:50%;background:#111827;
  }

  #sp-logo-wrap{
    width:24px;height:24px;border-radius:6px;flex-shrink:0;
    display:flex;align-items:center;justify-content:center;
    color:#111827;
  }
  #sp-title{
    font-size:13px;font-weight:700;flex:1;color:#111827;
    letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  }
  #sp-dot{
    width:7px;height:7px;border-radius:50%;background:#d1d5db;
    flex-shrink:0;transition:background .3s;
  }
  #sp-dot.ok {background:#10b981;}
  #sp-dot.err{background:#ef4444;}

  /* Minimize & close buttons */
  .sp-hbtn{
    width:22px;height:22px;border-radius:6px;flex-shrink:0;
    background:transparent;border:1px solid transparent;
    color:#9ca3af;font-size:11px;cursor:pointer;
    display:flex;align-items:center;justify-content:center;
    transition:all .15s ease;
  }
  .sp-hbtn:hover {
    background:#f3f4f6;
    color:#111827;
    border-color:#e5e7eb;
  }

  /* ── Config panel ── */
  #sp-cfg{
    padding:12px 16px 10px;
    border-bottom:1px solid #e5e7eb;
    background:#fafafa;
    flex-shrink:0;
  }
  .sp-lbl{
    display:block;font-size:10px;font-weight:600;
    color:#6b7280;text-transform:uppercase;
    letter-spacing:0.05em;margin-bottom:5px;
  }
  .sp-inp{
    width:100%;padding:7px 10px;
    background:#ffffff;border:1px solid #e5e7eb;
    border-radius:6px;color:#111827;font-size:12px;font-weight:400;
    font-family:inherit;
    outline:none;box-sizing:border-box;
    transition:all .15s ease-in-out;
  }
  .sp-inp:focus{
    border-color:#d1d5db;
  }
  .sp-inp::placeholder{color:#9ca3af;}
  #sp-row-wrap{display:flex;gap:8px;margin-top:9px;}
  #sp-row-wrap>div{flex:1;}
  .sp-row-ctrl{display:flex;align-items:center;gap:5px;}
  .sp-row-btn{
    width:28px;height:28px;flex-shrink:0;border-radius:6px;
    border:1px solid #e5e7eb;background:#ffffff;
    color:#6b7280;font-size:16px;cursor:pointer;
    display:flex;align-items:center;justify-content:center;line-height:1;
    transition:all .15s ease;
  }
  .sp-row-btn:hover{
    background:#f3f4f6;color:#111827;border-color:#d1d5db;
  }

  /* ── Analyze button ── */
  #sp-act{padding:10px 16px;flex-shrink:0;}
  #sp-analyze{
    width:100%;padding:9px 16px;border:1px solid #000000;border-radius:9999px;
    background:#000000;
    color:#ffffff;font-size:12px;font-weight:500;
    font-family:inherit;
    cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;
    box-shadow:0 1px 2px rgba(0,0,0,0.05);
    transition:all .15s ease-in-out;
  }
  #sp-analyze:hover:not(:disabled){background:#333333;border-color:#333333;}
  #sp-analyze:disabled{opacity:0.4;cursor:not-allowed;}

  /* ── Scrollable body ── */
  #sp-body{
    flex:1;
    min-height:0;
    overflow-y:auto;
    overflow-x:hidden;
    padding:12px 16px;
    background:#ffffff;
  }
  #sp-body::-webkit-scrollbar{width:5px;}
  #sp-body::-webkit-scrollbar-track{background:transparent;}
  #sp-body::-webkit-scrollbar-thumb{
    background:#e5e7eb;border-radius:10px;
  }

  /* ── State screens ── */
  .sp-center{
    display:flex;flex-direction:column;align-items:center;
    justify-content:center;padding:28px 12px;gap:10px;
    text-align:center;color:#6b7280;
    min-height:120px;
  }
  .sp-center p{font-size:12px;line-height:1.6;font-weight:400;}
  .sp-icon{color:#9ca3af;}
  .sp-spin{
    width:24px;height:24px;border-radius:50%;
    border:2px solid #e5e7eb;border-top-color:#000000;
    animation:sp-spin .8s linear infinite;
  }
  @keyframes sp-spin{to{transform:rotate(360deg);}}
  .sp-err{color:#ef4444;}
  .sp-ok {color:#10b981;}

  /* ── Field rows (idle) ── */
  .sp-section-hdr{
    font-size:10px;font-weight:600;color:#9ca3af;
    text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;
    display:flex;align-items:center;gap:8px;
  }
  .sp-section-hdr::after{content:'';flex:1;height:1px;background:#e5e7eb;}
  .sp-frow{display:flex;align-items:center;gap:8px;margin-bottom:7px;}
  .sp-flabel{
    font-size:11px;font-weight:500;color:#6b7280;
    min-width:90px;max-width:90px;flex-shrink:0;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  }
  .sp-frow .sp-vi{flex:1;}
  .sp-vi{
    width:100%;padding:6px 9px;
    background:#ffffff;border:1px solid #e5e7eb;
    border-radius:6px;color:#111827;font-size:12px;font-weight:400;
    font-family:inherit;
    outline:none;box-sizing:border-box;
    transition:all .15s ease;
  }
  .sp-vi:focus{
    border-color:#d1d5db;
  }
  .sp-vi::placeholder{color:#9ca3af;}
  .sp-vi.edited{
    border-color:#f59e0b;
    background:#fffde7;
  }
  .sp-src{
    margin-top:3px;font-size:10px;color:#9ca3af;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-style:italic;
  }

  /* ── Proposals header ── */
  .sp-phdr{
    display:flex;align-items:center;gap:8px;margin-bottom:12px;
    padding-bottom:10px;border-bottom:1px solid #e5e7eb;
  }
  .sp-phdr-txt{font-size:11px;font-weight:600;color:#6b7280;flex:1;letter-spacing:0.2px;}
  .sp-ai-badge{
    font-size:9px;font-weight:700;letter-spacing:0.5px;padding:2px 7px;border-radius:6px;
    background:#f3f4f6;color:#111827;
    border:1px solid #e5e7eb;text-transform:uppercase;
  }

  /* ── Field cards (proposals) ── */
  .sp-field-wrap{
    margin-bottom:8px;padding:8px 10px;
    background:#ffffff;border:1px solid #e5e7eb;
    border-radius:8px;transition:border-color .2s;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  }
  .sp-field-wrap:hover{border-color:#d1d5db;}
  .sp-field-wrap.ai-filled{border-left:2px solid #000000;}
  .sp-field-meta{display:flex;align-items:center;gap:6px;margin-bottom:6px;}
  .sp-field-name{font-size:11px;font-weight:600;color:#111827;flex:1;}
  .sp-tag{
    font-size:9px;font-weight:700;letter-spacing:0.4px;
    padding:1px 6px;border-radius:9999px;text-transform:uppercase;flex-shrink:0;
  }
  .sp-tag.high  {background:#e6f4ea;color:#137333;}
  .sp-tag.medium{background:#fef7e0;color:#b06000;}
  .sp-tag.low   {background:#fce8e6;color:#c5221f;}

  /* ── Bottom approve bar ── */
  #sp-bar{
    display:none;gap:8px;padding:10px 16px 12px;
    border-top:1px solid #e5e7eb;flex-shrink:0;
    background:#ffffff;
  }
  .sp-dismiss{
    flex:1;padding:8px;
    background:#ffffff;
    border:1px solid #e5e7eb;border-radius:9999px;
    color:#6b7280;font-size:11px;font-weight:500;
    font-family:inherit;
    cursor:pointer;
    transition:all .15s ease;
    display:inline-flex;align-items:center;justify-content:center;gap:4px;
  }
  .sp-dismiss:hover{background:#f3f4f6;color:#111827;}
  .sp-approve{
    flex:2;padding:8px;border:1px solid #10b981;border-radius:9999px;
    background:#10b981;
    color:#ffffff;font-size:11px;font-weight:500;
    font-family:inherit;
    cursor:pointer;
    box-shadow:0 1px 2px rgba(0,0,0,0.05);
    transition:all .15s ease;
    display:inline-flex;align-items:center;justify-content:center;gap:4px;
  }
  .sp-approve:hover:not(:disabled){background:#0e9f6e;border-color:#0e9f6e;}
  .sp-approve:disabled{opacity:0.4;cursor:not-allowed;}

  /* ── Reset / retry button ── */
  .sp-rbtn{
    margin-top:12px;padding:6px 16px;
    background:#ffffff;border:1px solid #e5e7eb;
    border-radius:9999px;color:#6b7280;font-size:11px;font-weight:500;
    font-family:inherit;
    cursor:pointer;transition:all .15s ease;
    display:inline-flex;align-items:center;gap:4px;
  }
  .sp-rbtn:hover{background:#f3f4f6;color:#111827;}

  /* ── Validation hints ── */
  #sp-path-err{font-size:10px;color:#ef4444;margin-top:4px;}
  #sp-row-warn{font-size:10px;color:#f59e0b;margin-top:4px;}
  #sp-sheet-sel option{background:#ffffff;color:#111827;}

  /* SVGs */
  .sp-icon-svg {
    width: 14px;
    height: 14px;
    stroke-width: 2;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sp-icon-svg-lg {
    width: 24px;
    height: 24px;
  }
  `;
  document.head.appendChild(style);

  // ─────────────────────────────────────────────────────────────────────────
  // HTML
  // ─────────────────────────────────────────────────────────────────────────
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.innerHTML = `
    <div id="sp-widget">
      <div id="sp-hdr">
        <div id="sp-grip"><span></span><span></span></div>
        <div id="sp-logo-wrap">
          <svg class="sp-icon-svg" style="stroke-width: 2.5;" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18M14 15l3-3-3-3M7 12h10"/></svg>
        </div>
        <span id="sp-title">SheetPilot AI</span>
        <span id="sp-dot"></span>
        <button id="sp-min" class="sp-hbtn" title="Minimize">─</button>
        <button id="sp-x"   class="sp-hbtn" title="Close">✕</button>
      </div>
      <div id="sp-cfg">
        <label class="sp-lbl">Excel Workbook Path</label>
        <input id="sp-wb" class="sp-inp" type="text" placeholder="C:\path\to\workbook.xlsx"/>
        <div id="sp-row-wrap">
          <div>
            <label class="sp-lbl">Active Row</label>
            <div class="sp-row-ctrl">
              <button id="sp-row-dec" class="sp-row-btn">−</button>
              <input id="sp-rn" class="sp-inp" type="number" value="2" min="2"
                style="text-align:center;font-weight:600;font-size:13px;"/>
              <button id="sp-row-inc" class="sp-row-btn">+</button>
            </div>
          </div>
          <div style="flex: 1;">
            <label class="sp-lbl">Backend Server URL</label>
            <input id="sp-be" class="sp-inp" type="text" value="http://127.0.0.1:8000" placeholder="http://127.0.0.1:8000" style="font-size:11px;"/>
          </div>
        </div>
      </div>
      <div id="sp-act">
        <button id="sp-analyze">
          <svg class="sp-icon-svg" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Analyze This Page
        </button>
      </div>
      <div id="sp-body">
        <div class="sp-center">
          <svg class="sp-icon-svg sp-icon-svg-lg" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <p>Set workbook path and click<br/><strong style="color:#111827">Analyze This Page</strong></p>
        </div>
      </div>
      <div id="sp-bar">
        <button class="sp-dismiss" id="sp-dismiss">
          <svg class="sp-icon-svg" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Dismiss
        </button>
        <button class="sp-approve" id="sp-approve">
          <svg class="sp-icon-svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          Approve &amp; Sync
        </button>
      </div>
    </div>`;
  document.body.appendChild(root);

  // drag capture layer
  const dragCap = document.createElement("div");
  dragCap.id = "sp-drag-cap";
  document.body.appendChild(dragCap);

  // ─────────────────────────────────────────────────────────────────────────
  // REFS
  // ─────────────────────────────────────────────────────────────────────────
  const widget   = document.getElementById("sp-widget");
  const hdr      = document.getElementById("sp-hdr");
  const dot      = document.getElementById("sp-dot");
  const closeBtn = document.getElementById("sp-x");
  const minBtn   = document.getElementById("sp-min");
  const wbInp    = document.getElementById("sp-wb");
  const rnInp    = document.getElementById("sp-rn");
  const beInp    = document.getElementById("sp-be");
  const analyzeB = document.getElementById("sp-analyze");
  const body     = document.getElementById("sp-body");
  const bar      = document.getElementById("sp-bar");
  const approveB = document.getElementById("sp-approve");
  const dismissB = document.getElementById("sp-dismiss");

  // ─────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────
  let S = { screen:"idle", proposals:null, edited:{}, manual:{}, columns:[], err:"", count:0 };

  // ─────────────────────────────────────────────────────────────────────────
  // SETTINGS
  // ─────────────────────────────────────────────────────────────────────────
  chrome.storage.local.get(["sp_wb","sp_rn","sp_backend_url"], (r) => {
    if (r.sp_wb) wbInp.value = r.sp_wb;
    if (r.sp_rn) rnInp.value = r.sp_rn;
    if (r.sp_backend_url) {
      BACKEND = r.sp_backend_url;
      beInp.value = r.sp_backend_url;
    }
    loadColumns();   // auto-load columns on startup if path is already saved
  });
  function save() {
    chrome.storage.local.set({
      sp_wb: wbInp.value,
      sp_rn: rnInp.value,
      sp_backend_url: beInp.value.trim() || "http://127.0.0.1:8000"
    });
  }

  // Save immediately on any change so settings are persistent
  wbInp.addEventListener("change", () => {
    save();
    S.columns = [];
    S.manual  = {};
    loadColumns();
  });
  wbInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      save();
      S.columns = [];
      S.manual  = {};
      loadColumns();
    }
  });
  beInp.addEventListener("change", () => {
    BACKEND = beInp.value.trim() || "http://127.0.0.1:8000";
    save();
    health();
    loadColumns();
  });
  rnInp.addEventListener("change", () => { save(); loadColumns(); });
  rnInp.addEventListener("input",  save);

  // + / − row buttons (added after DOM is ready)
  setTimeout(() => {
    const dec = document.getElementById("sp-row-dec");
    const inc = document.getElementById("sp-row-inc");
    if (dec) dec.addEventListener("click", () => {
      const v = parseInt(rnInp.value, 10);
      if (v > 2) {
        rnInp.value = v - 1; save();
        S.manual = {}; loadColumns();
      }
    });
    if (inc) inc.addEventListener("click", () => {
      rnInp.value = (parseInt(rnInp.value, 10) || 2) + 1; save();
      S.manual = {}; loadColumns();
    });
  }, 0);

  // ─────────────────────────────────────────────────────────────────────────
  // HEALTH
  // ─────────────────────────────────────────────────────────────────────────
  async function health() {
    try {
      const r = await fetch(BACKEND+"/health", {signal: AbortSignal.timeout(3000)});
      const d = await r.json();
      const ok = r.ok && d?.ollama?.ok;
      dot.className = ok ? "ok" : "err";
      dot.title = d?.ollama?.message || (ok ? "Backend online" : "Backend offline");
    } catch { dot.className="err"; dot.title="Cannot reach backend"; }
  }
  health();
  setInterval(health, 30000);

  // ─────────────────────────────────────────────────────────────────────────
  // DRAG — GPU-accelerated via transform:translate3d (zero layout reflow)
  // ─────────────────────────────────────────────────────────────────────────
  // Position widget using translate3d(posX, posY, 0) on a fixed element.
  // This is composited entirely on the GPU — no paint, no layout — giving
  // instant 1:1 finger tracking with no sticky lag.
  let isDrag = false, offX = 0, offY = 0;
  // Start near top-right with a comfortable margin
  let posX = window.innerWidth  - 380;
  let posY = 24;

  function applyPos() {
    // Clamp so widget stays on screen as viewport resizes
    const maxX = window.innerWidth  - widget.offsetWidth;
    const maxY = window.innerHeight - widget.offsetHeight;
    posX = Math.max(8, Math.min(maxX - 8, posX));
    posY = Math.max(8, Math.min(maxY - 8, posY));
    widget.style.transform = `translate3d(${posX}px,${posY}px,0)`;
  }
  applyPos();

  hdr.addEventListener("mousedown", (e) => {
    if (e.target === closeBtn || e.target === minBtn) return;
    e.preventDefault();
    e.stopPropagation();
    isDrag = true;
    offX = e.clientX - posX;
    offY = e.clientY - posY;
    dragCap.style.display = "block";
    widget.classList.add("sp-dragging");  // remove shadow transition while dragging
    widget.style.opacity = "0.94";
  });

  function endDrag() {
    if (!isDrag) return;
    isDrag = false;
    dragCap.style.display = "none";
    widget.classList.remove("sp-dragging");
    widget.style.opacity = "1";
  }

  // Direct rAF on every mousemove — no cancel/re-queue needed because
  // translate3d is compositor-only and we're inside a single rAF already.
  dragCap.addEventListener("mousemove", (e) => {
    if (!isDrag) return;
    requestAnimationFrame(() => {
      posX = e.clientX - offX;
      posY = e.clientY - offY;
      applyPos();
    });
  });
  dragCap.addEventListener("mouseup",    endDrag);
  dragCap.addEventListener("mouseleave", endDrag);
  // Also re-clamp on window resize so widget never goes off-screen
  window.addEventListener("resize", applyPos, {passive: true});

  // ─────────────────────────────────────────────────────────────────────────
  // ESCAPE helper
  // ─────────────────────────────────────────────────────────────────────────
  function h(s) {
    return String(s??"")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOAD COLUMNS — debounced, called on workbook/row change
  // ─────────────────────────────────────────────────────────────────────────
  let _loadTimer = null;
  function loadColumns() {
    clearTimeout(_loadTimer);
    _loadTimer = setTimeout(_doLoadColumns, 300);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WIRE MANUAL INPUTS
  // ─────────────────────────────────────────────────────────────────────────
  function wireManualInputs() {
    body.querySelectorAll(".sp-mval").forEach(inp => {
      inp.addEventListener("input", e => {
        const f = e.target.dataset.field;
        if (e.target.value.trim()) S.manual[f] = e.target.value;
        else delete S.manual[f];
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  function render() {
    // Approve bar shows whenever there are columns loaded (idle with cols OR proposals)
    const showBar = S.screen === "proposals" ||
                    (S.screen === "idle" && S.columns.length > 0);
    bar.style.display = showBar ? "flex" : "none";

    if      (S.screen === "idle")      renderIdle();
    else if (S.screen === "loading")   renderLoading();
    else if (S.screen === "proposals") renderProposals();
    else if (S.screen === "success")   renderSuccess();
    else                               renderError();
  }

  function renderIdle() {
    if (!S.columns.length) {
      body.innerHTML = `<div class="sp-center">
        <span class="sp-icon">📂</span>
        <p>Enter your Excel workbook path above —<br/>columns will appear here automatically.</p>
      </div>`;
      return;
    }
    let html = `<div class="sp-section-hdr">Row ${rnInp.value}</div>`;
    S.columns.forEach(col => {
      const val = S.manual[col] ?? "";
      html += `<div class="sp-frow">
        <span class="sp-flabel" title="${h(col)}">${h(col)}</span>
        <input class="sp-vi sp-mval" data-field="${h(col)}"
          type="text" value="${h(val)}" placeholder="Value…"/>
      </div>`;
    });
    body.innerHTML = html;
    wireManualInputs();
  }

  function renderLoading() {
    body.innerHTML = `<div class="sp-center">
      <div class="sp-spin"></div>
      <p style="color:rgba(255,255,255,.45);font-weight:500;">Analyzing page…</p>
      <p style="font-size:11px;">RAG indexing → LLM reasoning</p>
    </div>`;
  }

  function renderError() {
    body.innerHTML = `<div class="sp-center sp-err">
      <svg class="sp-icon-svg sp-icon-svg-lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p style="font-weight:600;color:#f87171;font-size:13px;">Something went wrong</p>
      <p style="font-size:11px;color:#9ca3af;margin-top:4px;line-height:1.5;">${h(S.err)}</p>
      <button class="sp-rbtn" id="sp-retry" style="color:#a5b4fc;border-color:rgba(99,102,241,0.2);">Try Again</button>
    </div>`;
    document.getElementById("sp-retry").onclick = reset;
  }

  function renderSuccess() {
    const writtenRow = (parseInt(rnInp.value, 10) || 2) - 1;
    body.innerHTML = `<div class="sp-center sp-ok">
      <div style="width:44px;height:44px;border-radius:50%;
        background:#e6f4ea;border:1px solid #137333;
        display:flex;align-items:center;justify-content:center;color:#137333;
        box-shadow:0 0 20px rgba(74,222,128,0.1);">
          <svg class="sp-icon-svg sp-icon-svg-lg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <p style="font-weight:600;color:#4ade80;font-size:13px;">${S.count} field${S.count!==1?"s":""} synced</p>
      <p style="color:#6b7280;font-size:11px;">Row ${writtenRow} updated successfully</p>
      <p style="color:#9ca3af;font-size:11px;margin-top:2px;">
        Next: Row <strong style="color:#818cf8;">${rnInp.value}</strong> ready
      </p>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="sp-rbtn" id="sp-again">Next Entry</button>
        <button class="sp-rbtn" id="sp-undo-btn" style="color:#fbbf24;border-color:rgba(251,191,36,.2);">Undo</button>
      </div>
      <div style="display:flex;gap:6px;margin-top:4px">
        <button class="sp-rbtn" id="sp-dl-json" style="font-size:10px">JSON</button>
        <button class="sp-rbtn" id="sp-dl-csv"  style="font-size:10px">CSV</button>
      </div>
    </div>`;
    document.getElementById("sp-again").onclick   = reset;
    document.getElementById("sp-dl-json").onclick = () => _downloadReport("json");
    document.getElementById("sp-dl-csv").onclick  = () => _downloadReport("csv");
    document.getElementById("sp-undo-btn").onclick = async () => {
      const wb = wbInp.value.trim();
      if (!wb) return;
      try {
        const res = await fetch(BACKEND + "/undo", {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({workbook_path: wb})
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.detail || "Undo failed");
        alert("✓ " + d.message);
        reset();
      } catch(e) { alert("Undo failed: " + e.message); }
    };
  }

  function renderProposals() {
    const { mappings=[], all_columns=[], row } = S.proposals || {};
    // S.manual already has all AI values merged in (done at analyze time).
    // renderProposals just displays what's in S.manual, wired to update it live.
    const cols = all_columns.length ? all_columns : S.columns;
    let html = `<div class="sp-phdr">
      <span class="sp-phdr-txt">Row ${row} — ${mappings.length} AI filled</span>
      <span class="sp-ai-badge">AI</span>
    </div>`;

    cols.forEach(col => {
      const aiMap = mappings.find(m => m.field === col);
      const val   = S.manual[col] ?? "";
      const conf  = aiMap?.confidence || "";
      const src   = aiMap?.source || "";
      html += `<div class="sp-field-wrap${aiMap ? " ai-filled" : ""}">
        <div class="sp-field-meta">
          <span class="sp-field-name">${h(col)}</span>
          ${aiMap ? `<span class="sp-tag ${conf}">${conf}</span>` : ""}
        </div>
        <input class="sp-vi sp-aval" data-field="${h(col)}"
          type="text" value="${h(val)}" placeholder="Value…"/>
        ${src ? `<div class="sp-src">↳ ${h(src.slice(0,90))}</div>` : ""}
      </div>`;
    });

    body.innerHTML = html;

    // Wire inputs — update S.manual on every keystroke
    body.querySelectorAll(".sp-aval").forEach(inp => {
      inp.addEventListener("input", e => {
        S.manual[e.target.dataset.field] = e.target.value;
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYZE
  // ─────────────────────────────────────────────────────────────────────────
  analyzeB.addEventListener("click", async () => {
    const wb  = wbInp.value.trim();
    const row = parseInt(rnInp.value, 10);
    if (!wb)        { alert("Enter the Excel workbook path."); return; }
    if (!row || row<1) { alert("Active row must be ≥ 1."); return; }
    save();
    const prevManual = {...S.manual};
    const prevCols   = [...S.columns];
    S = {screen:"loading", proposals:null, edited:{}, manual:prevManual, columns:prevCols, err:"", count:0};
    renderLoadingWithStatus("Analyzing page…"); analyzeB.disabled = true;

    try {
      const pageText = extractText();
      const res = await fetch(BACKEND+"/analyze", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({page_text:pageText, page_url:location.href,
          workbook_path:wb, active_row:row})
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error||d.detail||"Backend error");
      S.proposals = d.staged_mapping;
      S.screen = "proposals";

      // Eagerly merge ALL AI-proposed values into S.manual right now.
      // This means Approve & Sync works even if the user never touches an input.
      const { mappings = [], all_columns = [] } = S.proposals || {};
      mappings.forEach(m => {
        if (m.field && m.value !== undefined) {
          S.manual[m.field] = m.value;
        }
      });
      // Also ensure every column the AI knows about is represented (blank if not found)
      const cols = all_columns.length ? all_columns : S.columns;
      cols.forEach(col => {
        if (!(col in S.manual)) S.manual[col] = "";
      });
      render();
    } catch(e) {
      S.screen = "error"; S.err = e.message; render();
    } finally {
      analyzeB.disabled = false;
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // APPROVE
  // ─────────────────────────────────────────────────────────────────────────
  approveB.addEventListener("click", async () => {
    const wb  = wbInp.value.trim();
    const row = parseInt(rnInp.value, 10);
    if (!wb)        { alert("Enter workbook path."); return; }
    if (!row||row<1){ alert("Active row must be ≥ 1."); return; }

    const maps = Object.entries(S.manual)
      .filter(([f, v]) => f && v !== undefined && String(v).trim() !== "")
      .map(([f, v]) => ({field: f, value: String(v), edited: true}));
    if (!maps.length) { alert("No values to sync. Fill at least one field."); return; }

    approveB.disabled = true; approveB.textContent = "Writing…";
    try {
      const pageUrl = window.location.href;
      const res = await fetch(`${BACKEND}/commit?workbook_path=${encodeURIComponent(wb)}&page_url=${encodeURIComponent(pageUrl)}`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({row, approved_mappings: maps})
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error||d.detail||"Commit failed");
      S.screen = "success"; S.count = maps.length; S.proposals = null;

      // Auto-increment row for next entry
      const nextRow = (parseInt(rnInp.value, 10) || 2) + 1;
      rnInp.value = nextRow;
      save();

      render();
    } catch(e) {
      S.screen = "error"; S.err = e.message; render();
    } finally {
      approveB.disabled = false; approveB.innerHTML = `<svg class="sp-icon-svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Approve &amp; Sync`;
    }
  });

  dismissB.addEventListener("click", reset);
  closeBtn.addEventListener("click", () => { widget.style.display = "none"; });

  // Minimize toggle — collapses body/config, leaves header visible
  let _minimized = false;
  minBtn.addEventListener("click", () => {
    _minimized = !_minimized;
    widget.classList.toggle("sp-minimized", _minimized);
    minBtn.textContent = _minimized ? "□" : "─";
    minBtn.title = _minimized ? "Restore" : "Minimize";
    // After toggling, re-clamp position since height changed
    setTimeout(applyPos, 0);
  });

  function reset() {
    S = {screen:"idle", proposals:null, edited:{}, manual:{}, columns:S.columns, err:"", count:0};
    // Always re-fetch so column changes in Excel are picked up
    S.columns = [];
    loadColumns();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE TEXT EXTRACTOR
  // ─────────────────────────────────────────────────────────────────────────
  function extractText() {
    const SKIP  = new Set(["SCRIPT","STYLE","NOSCRIPT","IFRAME","SVG","CANVAS","HEAD","TEMPLATE",
                           "NAV","FOOTER","ASIDE","sheetpilot-root"]);
    const BLOCK = new Set(["P","DIV","SECTION","H1","H2","H3","H4","H5","H6","LI","TR","BLOCKQUOTE"]);

    // ── Structured metadata block (prepended — LLM finds it first) ───────────
    const metaParts = [];

    // Page title
    if (document.title) metaParts.push("Page Title: " + document.title);

    // Canonical URL & meta tags
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) metaParts.push("Canonical URL: " + canonical.href);

    // Open Graph + Twitter card tags (rich source of company/page data)
    document.querySelectorAll('meta[property^="og:"], meta[name^="og:"], meta[name^="twitter:"]')
      .forEach(m => {
        const key = (m.getAttribute("property") || m.getAttribute("name") || "").replace(/^og:|^twitter:/,"");
        const val = m.getAttribute("content");
        if (key && val) metaParts.push("Meta " + key + ": " + val);
      });

    // Standard meta description + keywords
    ["description","keywords","author"].forEach(name => {
      const m = document.querySelector('meta[name="' + name + '"]');
      if (m && m.content) metaParts.push("Meta " + name + ": " + m.content);
    });

    // Form inputs and selected values (captures form data on web pages)
    document.querySelectorAll("input[value], select").forEach(inp => {
      const label = inp.labels?.[0]?.textContent?.trim() || inp.name || inp.id;
      const val   = inp.value?.trim();
      if (label && val && val.length < 100) {
        metaParts.push("Form Field (" + label + "): " + val);
      }
    });

    // Schema.org JSON-LD (extremely reliable structured data)
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try {
        const obj = JSON.parse(s.textContent);
        const flat = (o, prefix) => {
          Object.entries(o).forEach(([k,v]) => {
            if (typeof v === "string" && v.length < 300)
              metaParts.push("Schema " + (prefix?prefix+".":"") + k + ": " + v);
            else if (typeof v === "object" && v && !Array.isArray(v))
              flat(v, prefix?prefix+"."+k:k);
          });
        };
        flat(obj, "");
      } catch {}
    });

    // All <a href> links with visible text (catches website URLs)
    document.querySelectorAll("a[href]").forEach(a => {
      const href = a.href;
      const txt  = a.textContent.trim();
      if (href && href.startsWith("http") && txt && txt.length < 80)
        metaParts.push("Link: " + txt + " → " + href);
    });

    // H1 and H2 headings explicitly labelled
    document.querySelectorAll("h1, h2").forEach(h => {
      const t = h.textContent.trim();
      if (t) metaParts.push(h.tagName + ": " + t);
    });

    // ── Body text walker ──────────────────────────────────────────────────────
    const w = document.createTreeWalker(document.body,
      NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT, {
        acceptNode(n) {
          if (n.nodeType===Node.ELEMENT_NODE) {
            if (SKIP.has(n.tagName)||SKIP.has(n.id)) return NodeFilter.FILTER_REJECT;
            const s = window.getComputedStyle(n);
            if (s.display==="none"||s.visibility==="hidden") return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
          return n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });
    const bodyParts = [];
    let n;
    while ((n=w.nextNode())) {
      if (n.nodeType===Node.ELEMENT_NODE) {
        if (BLOCK.has(n.tagName)) bodyParts.push("\n");
        if (n.tagName==="TD"||n.tagName==="TH") bodyParts.push("\t");
      } else {
        const t = n.textContent.trim();
        if (t) bodyParts.push(t+" ");
      }
    }

    // Structured metadata first (most reliable), then body text
    const structured = metaParts.join("\n");
    const body       = bodyParts.join("").replace(/\n{3,}/g,"\n\n").trim();
    const combined   = (structured + "\n\n--- PAGE BODY ---\n" + body).trim();
    const MAX_CHARS  = 15000;
    return combined.length > MAX_CHARS ? combined.slice(0, MAX_CHARS) + "\n\n[Content truncated at 15,000 chars for optimal performance]" : combined;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TOGGLE from toolbar & MESSAGE RELAY
  // ─────────────────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "TOGGLE_OVERLAY") {
      const isHidden = widget.style.display === "none";
      widget.style.display = isHidden ? "flex" : "none";
      if (isHidden && S.screen === "idle") {
        S.columns = [];
        S.manual  = {};
        loadColumns();
      }
    } else if (msg.type === "GET_PAGE_TEXT_INTERNAL") {
      sendResponse({ text: extractText(), url: location.href });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3.2  ROW NAVIGATOR — jump to next empty row
  // ─────────────────────────────────────────────────────────────────────────
  async function jumpToNextEmptyRow() {
    const wb  = wbInp.value.trim();
    const cur = parseInt(rnInp.value, 10) || 2;
    if (!wb) return;
    try {
      const res = await fetch(
        `${BACKEND}/next-empty-row?workbook_path=${encodeURIComponent(wb)}&start_row=${cur + 1}`
      );
      if (!res.ok) return;
      const d = await res.json();
      rnInp.value = d.next_empty_row;
      save();
      S.manual = {};
      loadColumns();
    } catch {}
  }

  // Add "→ Next empty" button into the row control area after DOM ready
  setTimeout(() => {
    const ctrl = document.querySelector(".sp-row-ctrl");
    if (ctrl) {
      const btn = document.createElement("button");
      btn.className   = "sp-row-btn";
      btn.title       = "Jump to next empty row";
      btn.textContent = "→";
      btn.style.fontSize = "11px";
      btn.addEventListener("click", jumpToNextEmptyRow);
      ctrl.appendChild(btn);
    }
  }, 50);

  // ─────────────────────────────────────────────────────────────────────────
  // 1.2  MULTI-SHEET — add sheet selector below workbook path
  // ─────────────────────────────────────────────────────────────────────────
  let S_sheet = "";   // currently selected sheet name

  function _injectSheetSelector(sheetNames) {
    const cfg = document.getElementById("sp-cfg");
    let sel = document.getElementById("sp-sheet-sel");
    if (!sel) {
      const wrap = document.createElement("div");
      wrap.style.marginTop = "7px";
      wrap.innerHTML = `
        <label class="sp-lbl">Worksheet</label>
        <select id="sp-sheet-sel" class="sp-inp" style="cursor:pointer;"></select>`;
      cfg.appendChild(wrap);
      sel = document.getElementById("sp-sheet-sel");
      sel.addEventListener("change", () => {
        S_sheet = sel.value;
        S.manual = {};
        loadColumns();
      });
    }
    const prev = sel.value;
    sel.innerHTML = sheetNames
      .map(n => `<option value="${h(n)}" ${n===S_sheet?"selected":""}>${h(n)}</option>`)
      .join("");
    if (!S_sheet || !sheetNames.includes(S_sheet)) {
      S_sheet = sheetNames[0] || "";
      sel.value = S_sheet;
    }
  }

  // _doLoadColumns is defined once below (enhanced version with multi-sheet,
  // inline validation, and semantic map — replaces the old simple version).
  async function _doLoadColumns() {
    const wb  = wbInp.value.trim();
    const row = parseInt(rnInp.value, 10) || 2;
    if (!wb) { S.columns = []; if (S.screen==="idle") render(); return; }
    try {
      let url = `${BACKEND}/schema?workbook_path=${encodeURIComponent(wb)}&active_row=${row}`;
      if (S_sheet) url += `&worksheet_name=${encodeURIComponent(S_sheet)}`;
      const res = await fetch(url);
      if (!res.ok) {
        // 4.2 Inline validation — show path error
        S.columns = [];
        _showPathError(res.status === 400 ? "File not found or unreadable" : "Backend error");
        return;
      }
      const d = await res.json();
      S.columns = (d.columns || []).filter(c => c && typeof c === "string");

      // Multi-sheet: inject selector if more than one sheet
      if (d.sheet_names && d.sheet_names.length > 1) {
        _injectSheetSelector(d.sheet_names);
      }

      // 4.2 — Row has data warning
      if (d.current_row_data) {
        const hasData = Object.values(d.current_row_data).some(v => v && String(v).trim());
        _showRowWarning(hasData
          ? "Row " + row + " already has data — values will be overwritten on sync"
          : "");
      }

      // Pre-fill manual from existing row data (only if user hasn't typed)
      if (d.current_row_data && Object.keys(S.manual).length === 0) {
        S.columns.forEach(col => {
          const existing = d.current_row_data[col];
          if (existing && String(existing).trim()) S.manual[col] = String(existing);
        });
      }

      // 3.3 Dynamic field templates — load semantic map for AI hints
      _loadSemanticMap(wb);

      if (S.screen === "idle") render();
    } catch (e) {
      console.error("[SheetPilot] loadColumns failed:", e);
      S.columns = []; if (S.screen === "idle") render();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4.2  INLINE VALIDATION — path error + row-has-data warning
  // ─────────────────────────────────────────────────────────────────────────
  function _showPathError(msg) {
    wbInp.style.borderColor = msg ? "rgba(248,113,113,0.5)" : "";
    wbInp.style.boxShadow   = msg ? "0 0 0 3px rgba(248,113,113,0.1)" : "";
    let el = document.getElementById("sp-path-err");
    if (!el) {
      el = document.createElement("div");
      el.id = "sp-path-err";
      el.style.cssText = "font-size:10px;color:#f87171;margin-top:4px;";
      wbInp.parentNode.insertBefore(el, wbInp.nextSibling);
    }
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  }

  function _showRowWarning(msg) {
    let el = document.getElementById("sp-row-warn");
    if (!el) {
      el = document.createElement("div");
      el.id = "sp-row-warn";
      el.style.cssText =
        "font-size:10px;color:#fbbf24;margin-top:4px;padding:3px 0;";
      const rowWrap = document.getElementById("sp-row-wrap");
      if (rowWrap) rowWrap.parentNode.insertBefore(el, rowWrap.nextSibling);
    }
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3.3  DYNAMIC FIELD TEMPLATES — per-workbook semantic map cache
  // ─────────────────────────────────────────────────────────────────────────
  const _semanticCache = {};   // { workbookPath: { colName: semanticHint } }

  async function _loadSemanticMap(wb) {
    if (_semanticCache[wb]) return;
    try {
      const res = await fetch(
        `${BACKEND}/suggest-mappings?workbook_path=${encodeURIComponent(wb)}`
      );
      if (!res.ok) return;
      const d = await res.json();
      _semanticCache[wb] = d.semantic_map || {};
      // Persist to chrome storage
      chrome.storage.local.set({ ["sp_smap_" + btoa(wb).slice(0,20)]: d.semantic_map });
    } catch {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2.3  STREAMING LOADING STATE — live progress updates via SSE
  // ─────────────────────────────────────────────────────────────────────────
  function renderLoadingWithStatus(msg) {
    body.innerHTML = `<div class="sp-center">
      <div class="sp-spin"></div>
      <p style="color:rgba(255,255,255,.45);font-weight:500;" id="sp-status-txt">
        ${h(msg || "Analyzing page…")}
      </p>
      <p style="font-size:10px;color:rgba(255,255,255,.2);">Ctrl+Shift+A to re-analyze</p>
    </div>`;
  }

  function updateLoadingStatus(msg) {
    const el = document.getElementById("sp-status-txt");
    if (el) el.textContent = msg;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3.4  KEYBOARD SHORTCUTS
  // ─────────────────────────────────────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    // Only when widget is visible
    if (widget.style.display === "none") return;

    // Ctrl+Enter → Approve & Sync
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      if (!approveB.disabled && bar.style.display !== "none") approveB.click();
    }
    // Ctrl+Shift+A → Analyze This Page
    if (e.ctrlKey && e.shiftKey && e.key === "A") {
      e.preventDefault();
      if (!analyzeB.disabled) analyzeB.click();
    }
    // Escape → close overlay
    if (e.key === "Escape" && !e.ctrlKey && !e.shiftKey) {
      widget.style.display = "none";
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4.3  SYNC REPORT — download JSON/CSV of session history
  // ─────────────────────────────────────────────────────────────────────────
  let _sessionHistory = [];   // accumulates committed rows this session

  function _recordSync(row, wb, maps) {
    _sessionHistory.push({
      timestamp:     new Date().toISOString(),
      workbook_path: wb,
      row,
      page_url:      location.href,
      fields:        maps,
    });
  }

  function _downloadReport(format) {
    if (!_sessionHistory.length) { alert("No syncs in this session yet."); return; }
    let content, mime, ext;
    if (format === "json") {
      content = JSON.stringify(_sessionHistory, null, 2);
      mime = "application/json"; ext = "json";
    } else {
      // CSV
      const rows  = [["timestamp","workbook_path","row","page_url","field","value"]];
      _sessionHistory.forEach(s => {
        s.fields.forEach(f => rows.push([
          s.timestamp, s.workbook_path, s.row, s.page_url, f.field, f.value
        ]));
      });
      content = rows.map(r => r.map(c => '"'+String(c||"").replace(/"/g,'""')+'"').join(",")).join("\n");
      mime = "text/csv"; ext = "csv";
    }
    const blob = new Blob([content], {type: mime});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "sheetpilot_report_" + Date.now() + "." + ext;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }



  // Wire approve to record history
  approveB.addEventListener("click", (e) => {
    // We need the row + maps after approval — patch via MutationObserver on success screen
    const _origRow = parseInt(rnInp.value, 10) || 2;
    const wb = wbInp.value.trim();
    const maps = Object.entries(S.manual)
      .filter(([f, v]) => f && v && String(v).trim())
      .map(([f, v]) => ({field: f, value: String(v)}));
    // Record regardless — actual write will happen in the main approve handler
    setTimeout(() => {
      if (S.screen === "success") {
        _recordSync(_origRow, wb, maps);
      }
    }, 2000);
  }, true);  // capture phase so we record before the main handler resets state

  // Wire analyze to show live SSE status
  analyzeB.addEventListener("click", () => {
    // Update loading text from SSE stream in parallel (fire and forget)
    const wb  = wbInp.value.trim();
    const row = parseInt(rnInp.value, 10) || 2;
    if (!wb) return;
    const sse = new EventSource(
      `${BACKEND}/analyze/stream?page_url=${encodeURIComponent(location.href)}` +
      `&workbook_path=${encodeURIComponent(wb)}&active_row=${row}`
    );
    sse.onmessage = (evt) => {
      try {
        const d = JSON.parse(evt.data);
        if (d.type === "status") updateLoadingStatus(d.msg);
        if (d.type === "done" || d.type === "error") sse.close();
      } catch {}
    };
    sse.onerror = () => sse.close();
    // Auto-close if analyze completes before SSE finishes
    setTimeout(() => sse.close(), 50000);
  }, true);  // capture phase — fires before main handler

  // ─────────────────────────────────────────────────────────────────────────
  // 4.1  ONBOARDING FLOW — first-launch 3-step walkthrough
  // ─────────────────────────────────────────────────────────────────────────
  function _showOnboarding() {
    const steps = [
      { icon: "📂", title: "Set your workbook", body: "Paste the full path to your Excel (.xlsx) or CSV file in the Workbook Path field." },
      { icon: "🔢", title: "Pick the row",      body: "Use + / − to select the row you want to fill. Row 2 is the first data row." },
      { icon: "🔍", title: "Analyze & Sync",    body: "Click Analyze This Page to let AI fill fields from the webpage, or type values manually. Then click Approve & Sync." },
    ];
    let step = 0;
    const overlay = document.createElement("div");
    overlay.id = "sp-onboard";
    overlay.style.cssText = [
      "position:absolute","inset:0","z-index:10","border-radius:20px",
      "background:rgba(7,7,12,0.97)","display:flex","flex-direction:column",
      "align-items:center","justify-content:center","padding:24px 20px","gap:14px",
      "font-family:'Space Grotesk',system-ui,sans-serif",
    ].join(";");

    function _renderStep() {
      const s = steps[step];
      overlay.innerHTML = `
        <div style="font-size:32px">${s.icon}</div>
        <p style="font-size:13px;font-weight:600;color:#f0f0fa;text-align:center">${s.title}</p>
        <p style="font-size:11.5px;color:rgba(255,255,255,.4);text-align:center;line-height:1.6">${s.body}</p>
        <div style="display:flex;gap:6px;margin-top:4px">
          ${steps.map((_,i) => `<div style="width:6px;height:6px;border-radius:50%;background:${i===step?"#6366f1":"rgba(255,255,255,.15)"}"></div>`).join("")}
        </div>
        <div style="display:flex;gap:8px;width:100%;margin-top:4px">
          ${step > 0 ? `<button id="sp-ob-back" style="flex:1;padding:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:rgba(255,255,255,.4);font-size:11px;cursor:pointer;">← Back</button>` : ""}
          <button id="sp-ob-next" style="flex:2;padding:8px;border:none;border-radius:9px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-size:11px;font-weight:600;cursor:pointer;">
            ${step < steps.length-1 ? "Next →" : "Get Started ✓"}
          </button>
        </div>`;
      document.getElementById("sp-ob-next").onclick = () => {
        if (step < steps.length - 1) { step++; _renderStep(); }
        else { overlay.remove(); chrome.storage.local.set({ sp_onboarded: true }); }
      };
      const back = document.getElementById("sp-ob-back");
      if (back) back.onclick = () => { step--; _renderStep(); };
    }
    _renderStep();
    widget.appendChild(overlay);
  }

  chrome.storage.local.get("sp_onboarded", (r) => {
    if (!r.sp_onboarded) _showOnboarding();
  });

  render();


})();

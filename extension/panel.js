/**
 * panel.js — logic for the SheetPilot AI side panel.
 *
 * Flow:
 *   1. On load, check backend health and restore saved settings.
 *   2. User clicks "Analyze" → asks content script for page text via background.
 *   3. POST /analyze → display proposed mappings.
 *   4. User reviews / edits values → clicks "Approve & Sync".
 *   5. POST /commit → show success screen.
 *
 * All state is kept in a simple `state` object. UI is fully re-rendered
 * from state on each change (simple, no framework needed at this scale).
 */

const BACKEND = "http://127.0.0.1:8000";
const STORAGE_KEYS = { workbookPath: "sp_workbook_path", activeRow: "sp_active_row" };

// ── DOM refs ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const workbookPathInput = $("workbookPath");
const activeRowInput    = $("activeRow");
const analyzeBtn        = $("analyzeBtn");
const mainContent       = $("mainContent");
const approveBar        = $("approveBar");
const approveBtn        = $("approveBtn");
const rejectBtn         = $("rejectBtn");
const statusDot         = $("statusDot");

// ── App state ─────────────────────────────────────────────────────────────
let state = {
  screen: "idle",       // idle | loading | proposals | success | error
  proposals: null,      // StagedMapping from backend
  editedValues: {},     // { fieldName: editedValue }
  errorMsg: "",
  lastCommitCount: 0,
};

// ── Settings persistence ──────────────────────────────────────────────────
function saveSettings() {
  chrome.storage.local.set({
    [STORAGE_KEYS.workbookPath]: workbookPathInput.value,
    [STORAGE_KEYS.activeRow]:    activeRowInput.value,
  });
}

function loadSettings() {
  chrome.storage.local.get(
    [STORAGE_KEYS.workbookPath, STORAGE_KEYS.activeRow],
    (result) => {
      if (result[STORAGE_KEYS.workbookPath]) {
        workbookPathInput.value = result[STORAGE_KEYS.workbookPath];
      }
      if (result[STORAGE_KEYS.activeRow]) {
        activeRowInput.value = result[STORAGE_KEYS.activeRow];
      }
    }
  );
}

// ── Backend health check ──────────────────────────────────────────────────
async function checkHealth() {
  try {
    const res = await fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    const ok = res.ok && data?.ollama?.ok;
    statusDot.className = `status-dot ${ok ? "ok" : "err"}`;
    statusDot.title = data?.ollama?.message || (ok ? "Backend online" : "Backend offline");
  } catch {
    statusDot.className = "status-dot err";
    statusDot.title = "Cannot reach backend at " + BACKEND;
  }
}

// ── Render functions ──────────────────────────────────────────────────────
function render() {
  switch (state.screen) {
    case "idle":      renderIdle();      break;
    case "loading":   renderLoading();   break;
    case "proposals": renderProposals(); break;
    case "success":   renderSuccess();   break;
    case "error":     renderError();     break;
  }

  // Show approve bar only when there are proposals to action
  approveBar.style.display =
    state.screen === "proposals" && state.proposals ? "flex" : "none";
}

function renderIdle() {
  mainContent.innerHTML = `
    <div class="state-idle">
      <svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
      <p>Configure your workbook path above, then click <strong>Analyze This Page</strong> to extract data.</p>
    </div>`;
}

function renderLoading() {
  mainContent.innerHTML = `
    <div class="state-loading">
      <div class="spinner"></div>
      <p>Analyzing page with local AI…<br/>
         <small style="color:#9aa0a6">RAG indexing + LLM reasoning in progress</small>
      </p>
    </div>`;
}

function renderError() {
  mainContent.innerHTML = `
    <div class="state-error">
      <svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p><strong>Something went wrong</strong></p>
      <p style="font-size:12px;color:#5f6368;margin-top:4px;">${escHtml(state.errorMsg)}</p>
      <button class="btn btn-outline" style="margin-top:12px" onclick="resetToIdle()">Try Again</button>
    </div>`;
}

function renderSuccess() {
  mainContent.innerHTML = `
    <div class="state-success">
      <svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      <p><strong>${state.lastCommitCount} field${state.lastCommitCount !== 1 ? "s" : ""} written to Excel</strong></p>
      <p>Row ${activeRowInput.value} has been updated.</p>
      <button class="btn btn-outline" style="margin-top:16px" onclick="resetToIdle()">
        Analyze Another Page
      </button>
    </div>`;
}

function renderProposals() {
  const staged = state.proposals;
  if (!staged) { renderIdle(); return; }

  const { mappings = [], missing_fields = [], row } = staged;

  let html = `
    <div class="proposals-header">
      <h2>Proposed Mappings — Row ${row}</h2>
      <span class="badge">${mappings.length} found</span>
    </div>`;

  if (mappings.length === 0 && missing_fields.length === 0) {
    html += `<p style="color:#9aa0a6;font-size:12px;">All fields are already filled for this row.</p>`;
  }

  // ── Proposal cards ────────────────────────────────────────────────
  mappings.forEach((m, idx) => {
    const currentVal = state.editedValues[m.field] ?? m.value;
    const isEdited   = state.editedValues[m.field] !== undefined &&
                       state.editedValues[m.field] !== m.value;
    const confClass  = `confidence-${m.confidence}`;
    const confBadge  = `conf-${m.confidence}`;

    html += `
      <div class="proposal-card ${confClass}">
        <div class="card-header">
          <span class="field-name">${escHtml(m.field)}</span>
          <span class="conf-badge ${confBadge}">${m.confidence}</span>
        </div>
        <div class="card-body">
          <input
            class="value-input ${isEdited ? "edited" : ""}"
            data-field="${escHtml(m.field)}"
            data-idx="${idx}"
            type="text"
            value="${escHtml(currentVal)}"
            placeholder="(no value found)"
          />
          ${m.source ? `<div class="source-snippet" title="${escHtml(m.source)}">Source: ${escHtml(m.source.slice(0, 120))}</div>` : ""}
        </div>
      </div>`;
  });

  // ── Missing fields ────────────────────────────────────────────────
  if (missing_fields.length > 0) {
    html += `
      <div class="missing-section">
        <h3>Not found on this page (${missing_fields.length})</h3>
        ${missing_fields.map((f) => `<span class="missing-chip">${escHtml(f)}</span>`).join("")}
      </div>`;
  }

  mainContent.innerHTML = html;

  // Attach input listeners for live editing
  mainContent.querySelectorAll(".value-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const field = e.target.dataset.field;
      const original = state.proposals.mappings.find((m) => m.field === field)?.value ?? "";
      if (e.target.value !== original) {
        state.editedValues[field] = e.target.value;
        e.target.classList.add("edited");
      } else {
        delete state.editedValues[field];
        e.target.classList.remove("edited");
      }
    });
  });
}

// ── Analyze flow ──────────────────────────────────────────────────────────
analyzeBtn.addEventListener("click", async () => {
  const workbookPath = workbookPathInput.value.trim();
  const activeRow    = parseInt(activeRowInput.value, 10);

  if (!workbookPath) {
    alert("Please enter the path to your Excel workbook.");
    return;
  }
  if (!activeRow || activeRow < 1) {
    alert("Active row must be a positive integer.");
    return;
  }

  saveSettings();
  state = { screen: "loading", proposals: null, editedValues: {}, errorMsg: "", lastCommitCount: 0 };
  render();
  analyzeBtn.disabled = true;

  try {
    // Step 1: get page text from content script via background
    const pageData = await getPageText();
    if (pageData.error) throw new Error(pageData.error);

    // Step 2: POST to backend /analyze
    const response = await fetch(`${BACKEND}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page_text:      pageData.text,
        page_url:       pageData.url,
        workbook_path:  workbookPath,
        active_row:     activeRow,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || data.detail || "Backend returned an error.");
    }

    state.proposals = data.staged_mapping;
    state.editedValues = {};
    state.screen = "proposals";
    render();

  } catch (err) {
    state.screen = "error";
    state.errorMsg = err.message;
    render();
  } finally {
    analyzeBtn.disabled = false;
  }
});

// ── Approve flow ──────────────────────────────────────────────────────────
approveBtn.addEventListener("click", async () => {
  const workbookPath = workbookPathInput.value.trim();
  const staged       = state.proposals;
  if (!staged) return;

  // Build approved_mappings: use edited value if user changed it
  const approvedMappings = staged.mappings.map((m) => ({
    field:   m.field,
    value:   state.editedValues[m.field] ?? m.value,
    edited:  state.editedValues[m.field] !== undefined,
  }));

  approveBtn.disabled = true;
  approveBtn.textContent = "Writing…";

  try {
    const response = await fetch(
      `${BACKEND}/commit?workbook_path=${encodeURIComponent(workbookPath)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          row:               staged.row,
          approved_mappings: approvedMappings,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || data.detail || "Commit failed.");
    }

    state.screen = "success";
    state.lastCommitCount = data.rows_written !== undefined
      ? approvedMappings.length   // rows_written=1 but we show field count
      : approvedMappings.length;
    state.proposals = null;
    render();

  } catch (err) {
    state.screen = "error";
    state.errorMsg = err.message;
    render();
  } finally {
    approveBtn.disabled = false;
    approveBtn.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Approve &amp; Sync`;
  }
});

// ── Reject / dismiss ──────────────────────────────────────────────────────
rejectBtn.addEventListener("click", resetToIdle);

function resetToIdle() {
  state = { screen: "idle", proposals: null, editedValues: {}, errorMsg: "", lastCommitCount: 0 };
  render();
}

// ── Helper: ask background for current tab's text ─────────────────────────
function getPageText() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_PAGE_TEXT" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { error: "No response from content script" });
      }
    });
  });
}

// ── HTML escaping ─────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Initialise ────────────────────────────────────────────────────────────
loadSettings();
checkHealth();
setInterval(checkHealth, 30_000);   // re-check every 30s
render();

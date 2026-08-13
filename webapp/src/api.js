/* Centralized API client — respects custom backend URL setting */

const savedBase = localStorage.getItem('sp_backend_url') || ''
const BASE = savedBase ? savedBase.replace(/\/$/, '') : (import.meta.env.VITE_API_BASE || '')

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' }
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || err.error || 'Request failed')
  }
  return res.json()
}

const get  = (path) => request('GET', path)
const post = (path, body) => request('POST', path, body)

// ── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardApi = {
  stats:    ()         => get('/dashboard/stats'),
  activity: (days=30)  => get(`/dashboard/activity?days=${days}`),
  recent:   (limit=10) => get(`/dashboard/recent?limit=${limit}`),
}

// ── History ──────────────────────────────────────────────────────────────────
export const historyApi = {
  list: (workbook='', limit=50) =>
    get(`/history?${workbook ? `workbook_path=${encodeURIComponent(workbook)}&` : ''}limit=${limit}`),
  search: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([,v]) => v !== '' && v != null))
    ).toString()
    return get(`/history/search?${qs}`)
  },
}

// ── Workbooks ────────────────────────────────────────────────────────────────
export const workbooksApi = {
  list: () => get('/workbooks'),
}

// ── Schema / Excel ────────────────────────────────────────────────────────────
export const excelApi = {
  schema: (workbookPath, row = 2, sheet = '') =>
    get(`/schema?workbook_path=${encodeURIComponent(workbookPath)}&active_row=${row}${sheet ? `&worksheet_name=${encodeURIComponent(sheet)}` : ''}`),
}

// ── Analyze ──────────────────────────────────────────────────────────────────
export const analyzeApi = {
  fromUrl: (url, workbookPath, activeRow, worksheetName = null) =>
    post('/analyze-url', { url, workbook_path: workbookPath, active_row: activeRow, worksheet_name: worksheetName }),
}

// ── Commit / Undo ─────────────────────────────────────────────────────────────
export const commitApi = {
  approve: (workbookPath, row, mappings, pageUrl = '') =>
    post(`/commit?workbook_path=${encodeURIComponent(workbookPath)}${pageUrl ? `&page_url=${encodeURIComponent(pageUrl)}` : ''}`, { row, approved_mappings: mappings }),
  undo: (workbookPath, historyId = null) =>
    post('/undo', { workbook_path: workbookPath, history_id: historyId }),
}

// ── Health ────────────────────────────────────────────────────────────────────
export const systemApi = {
  health: () => get('/health'),
}

// ── Chat ──────────────────────────────────────────────────────────────────────
export const chatApi = {
  workbook: (workbookPath, query) =>
    post('/chat/workbook', { workbook_path: workbookPath, query }),
}


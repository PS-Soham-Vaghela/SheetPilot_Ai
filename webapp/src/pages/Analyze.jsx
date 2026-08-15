import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { analyzeApi, commitApi, workbooksApi } from '../api.js'
import { useToast } from '../App.jsx'
import FieldBadge from '../components/FieldBadge.jsx'

export default function Analyze() {
  const toast = useToast()
  const location = useLocation()
  const fileInputRef = useRef(null)
  const reUploadRef  = useRef(null)

  const searchParams = new URLSearchParams(location.search)
  const initialUrl = searchParams.get('url') || ''

  const [url,         setUrl]        = useState(initialUrl)
  const [wbPath,      setWbPath]     = useState(localStorage.getItem('sp_default_wb') || './sample_data/vendor_invoice.xlsx')
  const [row,         setRow]        = useState(2)
  const [loading,     setLoading]    = useState(false)
  const [uploading,   setUploading]  = useState(false)
  const [proposals,   setProposals]  = useState(null)
  const [values,      setValues]     = useState({})
  const [committing,  setCommitting] = useState(false)
  const [committed,   setCommitted]  = useState(false)

  // Cat 5 — paste-text fallback
  const [pasteMode,   setPasteMode]  = useState(false)
  const [pasteText,   setPasteText]  = useState('')
  const [blockedUrl,  setBlockedUrl] = useState('')

  // Cat 6 — workbook missing on server
  const [wbMissing,   setWbMissing]  = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // 'analyze' | null

  useEffect(() => {
    const qUrl = new URLSearchParams(location.search).get('url')
    if (qUrl) setUrl(qUrl)
  }, [location.search])

  // ── File upload helpers ──────────────────────────────────────────────────────

  const doUpload = async (file) => {
    if (!file) return null
    setUploading(true)
    try {
      const res = await workbooksApi.upload(file)
      setWbPath(res.workbook_path)
      localStorage.setItem('sp_default_wb', res.workbook_path)
      localStorage.setItem('sp_cloud_wb', res.workbook_path)
      toast.success(`Uploaded ${file.name}! Ready to analyze.`)
      return res.workbook_path
    } catch (err) {
      toast.error(`Upload failed: ${err.message}`)
      return null
    } finally {
      setUploading(false)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    await doUpload(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setWbMissing(false)
  }

  // Re-upload triggered when workbook is missing on server
  const handleReUpload = async (e) => {
    const file = e.target.files?.[0]
    const newPath = await doUpload(file)
    if (reUploadRef.current) reUploadRef.current.value = ''
    if (newPath && pendingAction === 'analyze') {
      setWbMissing(false)
      setPendingAction(null)
      runAnalyze(newPath)
    }
  }

  const setSampleWorkbook = () => {
    setWbPath('./sample_data/vendor_invoice.xlsx')
    localStorage.setItem('sp_default_wb', './sample_data/vendor_invoice.xlsx')
    setWbMissing(false)
    toast.info('Selected sample vendor invoice workbook.')
  }

  // ── Core analyze flow ────────────────────────────────────────────────────────

  const runAnalyze = async (overridePath) => {
    const effectivePath = overridePath || wbPath
    if (!url || !effectivePath) return
    setLoading(true); setProposals(null); setCommitted(false)
    try {
      const res = await analyzeApi.fromUrl(url, effectivePath, Number(row))
      if (!res.success) throw new Error(res.error || 'Analysis failed')
      const mappings = res.staged_mapping?.mappings || []
      setProposals(mappings)
      const initial = {}
      mappings.forEach(m => { initial[m.field] = m.value })
      setValues(initial)
    } catch (err) {
      const msg = err.message || ''
      // Cat 5 — detect blocked/failed fetch
      if (msg.toLowerCase().includes('failed to fetch url') ||
          msg.toLowerCase().includes('blocked') ||
          msg.toLowerCase().includes('bot') ||
          msg.toLowerCase().includes('403') ||
          msg.toLowerCase().includes('401') ||
          msg.toLowerCase().includes('cloudflare')) {
        setBlockedUrl(url)
        setPasteMode(true)
        setPasteText('')
        toast.error('This site blocks automated access. Paste the page text manually below.')
      } else if (msg.toLowerCase().includes('workbook not found') ||
                 msg.toLowerCase().includes('file not found') ||
                 (err.status === 404)) {
        // Cat 6 — workbook gone (server restart wiped uploads/)
        setWbMissing(true)
        setPendingAction('analyze')
        toast.error('Your workbook was lost after a server restart. Re-upload it below to continue.')
      } else {
        toast.error(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const analyze = (e) => {
    e?.preventDefault()
    runAnalyze()
  }

  // Cat 5 — analyze using pasted text
  const analyzePasted = async (e) => {
    e?.preventDefault()
    if (!pasteText.trim() || !wbPath) return
    setLoading(true); setProposals(null); setCommitted(false)
    try {
      const res = await analyzeApi.fromText(pasteText, blockedUrl || url, wbPath, Number(row))
      if (!res.success) throw new Error(res.error || 'Analysis failed')
      const mappings = res.staged_mapping?.mappings || []
      setProposals(mappings)
      const initial = {}
      mappings.forEach(m => { initial[m.field] = m.value })
      setValues(initial)
      setPasteMode(false)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Approve & sync ────────────────────────────────────────────────────────────

  const approve = async () => {
    setCommitting(true)
    try {
      const mappings = Object.entries(values).map(([field, value]) => ({
        field, value, edited: value !== (proposals.find(p => p.field === field)?.value ?? value)
      }))
      // Cat 1: pass current URL as pageUrl so history records the source
      await commitApi.approve(wbPath, Number(row), mappings, blockedUrl || url)
      toast.success(`Row ${row} synced to Excel!`)
      setCommitted(true)
      setRow(r => Number(r) + 1)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCommitting(false)
    }
  }

  const nextEntry = () => {
    setProposals(null); setCommitted(false); setValues({}); setUrl('')
    setBlockedUrl(''); setPasteMode(false); setPasteText('')
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1>Analyze URL</h1>
        <p style={{ marginTop: 4 }}>Paste any URL and let SheetPilot AI extract data into your Excel workbook — no extension needed.</p>
      </div>

      {/* Cat 6 — workbook missing banner */}
      {wbMissing && (
        <div className="card" style={{ marginBottom: 16, border: '1px solid var(--warning, #f59e0b)', background: 'rgba(245,158,11,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <strong>Workbook lost after server restart</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
                Render's free tier wipes uploaded files after inactivity. Re-upload your <code>{wbPath.split(/[/\\]/).pop()}</code> to continue.
              </p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => reUploadRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : '📁 Re-upload Workbook'}
            </button>
            <input type="file" ref={reUploadRef} onChange={handleReUpload} accept=".xlsx,.csv" style={{ display: 'none' }} />
            <button className="btn btn-ghost btn-sm" onClick={setSampleWorkbook}>Use Sample</button>
          </div>
        </div>
      )}

      {/* Input form */}
      <div className="card" style={{ marginBottom: 24 }}>
        <form onSubmit={analyze}>
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
            <div style={{ flex:3, minWidth:240 }}>
              <label className="inp-label">Page URL to analyze</label>
              <input className="inp" type="url" placeholder="https://example.com/invoice-or-product"
                value={url} onChange={e => setUrl(e.target.value)} required />
            </div>
            <div style={{ flex:2, minWidth:240 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="inp-label" style={{ marginBottom: 0 }}>Excel Workbook Path</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={setSampleWorkbook} style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                    Use Sample
                  </button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                    {uploading ? 'Uploading…' : '📁 Upload .xlsx'}
                  </button>
                </div>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.csv" style={{ display: 'none' }} />
              <input className="inp" placeholder="./sample_data/vendor_invoice.xlsx"
                value={wbPath} onChange={e => { setWbPath(e.target.value); localStorage.setItem('sp_default_wb', e.target.value); setWbMissing(false) }} required />
            </div>
            <div style={{ width:100 }}>
              <label className="inp-label">Active row</label>
              <input className="inp" type="number" min={2} value={row} onChange={e => setRow(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading || !url || !wbPath} style={{ minWidth:160 }}>
            {loading ? <><span className="spinner" style={{width:14,height:14}} /> Analyzing…</> : <><svg className="icon icon-sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Analyze This Page</>}
          </button>
        </form>
      </div>

      {/* Cat 5 — paste-text fallback panel */}
      {pasteMode && !loading && (
        <div className="card" style={{ marginBottom: 24, border: '1px solid var(--accent, #4f46e5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>🔒</span>
            <div>
              <strong>Site blocks automated access</strong>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
                Open <a href={blockedUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{blockedUrl}</a> in your browser, select all text (Ctrl+A), copy (Ctrl+C), then paste it below.
              </p>
            </div>
          </div>
          <form onSubmit={analyzePasted}>
            <textarea
              className="inp"
              placeholder="Paste the full page text here…"
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              style={{ width: '100%', minHeight: 160, resize: 'vertical', marginBottom: 10, fontFamily: 'monospace', fontSize: 12 }}
              required
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={loading || !pasteText.trim()}>
                {loading ? <><span className="spinner" style={{width:14,height:14}} /> Analyzing…</> : '✦ Analyze Pasted Text'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setPasteMode(false); setPasteText('') }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card" style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, padding:40 }}>
          <div className="spinner" style={{ width:36, height:36 }}/>
          <p>Fetching page and running AI analysis…</p>
        </div>
      )}

      {/* Proposals */}
      {proposals && !loading && (
        <div>
          <div className="section-hdr" style={{ marginBottom:16 }}>
            <h2>AI Proposals — Row {committed ? Number(row) - 1 : row}</h2>
            <div style={{ display:'flex', gap:8 }}>
              {committed
                ? (
                  <>
                    <span className="badge badge-active">✓ Synced!</span>
                    <a href={workbooksApi.downloadUrl(wbPath)} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <svg className="icon icon-sm" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Download .xlsx
                    </a>
                    <button className="btn btn-primary" onClick={nextEntry}>
                      Next Entry →
                    </button>
                  </>
                )
                : <button className="btn btn-primary" onClick={approve} disabled={committing}>
                    {committing ? '…' : '✓ Approve & Sync'}
                  </button>
              }
            </div>
          </div>

          {proposals.length === 0 ? (
            <div className="empty card"><span className="empty-icon"><svg className="icon icon-lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></span><p>No fields to fill — all cells already populated.</p></div>
          ) : (
            <div className="grid-2">
              {proposals.map(p => (
                <div key={p.field} className="card proposal-card">
                  <div className="proposal-field">
                    {p.field}
                    <FieldBadge confidence={p.confidence} />
                  </div>
                  <input
                    className={`proposal-inp${values[p.field] !== p.value ? ' edited' : ''}`}
                    value={values[p.field] ?? ''}
                    onChange={e => setValues(v => ({ ...v, [p.field]: e.target.value }))}
                    placeholder="Value…"
                  />
                  {p.source && <div className="proposal-src">Source: {p.source}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

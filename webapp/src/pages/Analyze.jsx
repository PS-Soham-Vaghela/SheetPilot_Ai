import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { analyzeApi, commitApi } from '../api.js'
import { useToast } from '../App.jsx'
import FieldBadge from '../components/FieldBadge.jsx'

export default function Analyze() {
  const toast = useToast()
  const location = useLocation()
  
  const searchParams = new URLSearchParams(location.search)
  const initialUrl = searchParams.get('url') || ''

  const [url,        setUrl]        = useState(initialUrl)
  const [wbPath,     setWbPath]     = useState(localStorage.getItem('sp_default_wb') || '')
  const [row,        setRow]        = useState(2)
  const [loading,    setLoading]    = useState(false)
  const [proposals,  setProposals]  = useState(null)
  const [values,     setValues]     = useState({})
  const [committing, setCommitting] = useState(false)
  const [committed,  setCommitted]  = useState(false)

  useEffect(() => {
    const qUrl = new URLSearchParams(location.search).get('url')
    if (qUrl) setUrl(qUrl)
  }, [location.search])

  const analyze = async (e) => {
    e?.preventDefault()
    if (!url || !wbPath) return
    setLoading(true); setProposals(null); setCommitted(false)
    try {
      const res = await analyzeApi.fromUrl(url, wbPath, Number(row))
      if (!res.success) throw new Error(res.error || 'Analysis failed')
      const mappings = res.staged_mapping?.mappings || []
      setProposals(mappings)
      const initial = {}
      mappings.forEach(m => { initial[m.field] = m.value })
      setValues(initial)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const approve = async () => {
    setCommitting(true)
    try {
      const mappings = Object.entries(values).map(([field, value]) => ({
        field, value, edited: value !== (proposals.find(p=>p.field===field)?.value ?? value)
      }))
      await commitApi.approve(wbPath, Number(row), mappings)
      toast.success(`Row ${row} synced to Excel!`)
      setCommitted(true)
      // Auto-increment row for next entry
      setRow(r => Number(r) + 1)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCommitting(false)
    }
  }

  const nextEntry = () => {
    setProposals(null)
    setCommitted(false)
    setValues({})
    setUrl('')
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1>Analyze URL</h1>
        <p style={{ marginTop: 4 }}>Paste any URL and let SheetPilot AI extract data into your Excel workbook — no extension needed.</p>
      </div>

      {/* Input form */}
      <div className="card" style={{ marginBottom: 24 }}>
        <form onSubmit={analyze}>
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
            <div style={{ flex:3, minWidth:240 }}>
              <label className="inp-label">Page URL to analyze</label>
              <input className="inp" type="url" placeholder="https://example.com/page"
                value={url} onChange={e=>setUrl(e.target.value)} required />
            </div>
            <div style={{ flex:2, minWidth:200 }}>
              <label className="inp-label">Excel workbook path</label>
              <input className="inp" placeholder="C:\Users\...\Book1.xlsx"
                value={wbPath} onChange={e=>{setWbPath(e.target.value); localStorage.setItem('sp_default_wb', e.target.value)}} required />
            </div>
            <div style={{ width:100 }}>
              <label className="inp-label">Active row</label>
              <input className="inp" type="number" min={2} value={row} onChange={e=>setRow(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading || !url || !wbPath} style={{ minWidth:160 }}>
            {loading ? <><span className="spinner" style={{width:14,height:14}} /> Analyzing…</> : <><svg className="icon icon-sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Analyze This Page</>}
          </button>
        </form>
      </div>

      {/* Proposals */}
      {loading && (
        <div className="card" style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, padding:40 }}>
          <div className="spinner" style={{ width:36, height:36 }}/>
          <p>Fetching page and running AI analysis…</p>
        </div>
      )}

      {proposals && !loading && (
        <div>
          <div className="section-hdr" style={{ marginBottom:16 }}>
            <h2>AI Proposals — Row {committed ? Number(row) - 1 : row}</h2>
            <div style={{ display:'flex', gap:8 }}>
              {committed
                ? (
                  <>
                    <span className="badge badge-active">✓ Synced!</span>
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


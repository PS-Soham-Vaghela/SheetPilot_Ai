import { useEffect, useState } from 'react'
import { workbooksApi, historyApi } from '../api.js'
import WorkbookCard from '../components/WorkbookCard.jsx'
import SyncRow from '../components/SyncRow.jsx'

export default function Workbooks() {
  const [workbooks, setWorkbooks] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState(null)
  const [wbHistory, setWbHistory] = useState([])
  const [wbLoading, setWbLoading] = useState(false)

  useEffect(() => {
    workbooksApi.list()
      .then(r => setWorkbooks(r.workbooks || []))
      .finally(() => setLoading(false))
  }, [])

  const openWorkbook = async (wb) => {
    setSelected(wb); setWbLoading(true)
    try {
      const res = await historyApi.list(wb.workbook_path, 100)
      setWbHistory(res.history || [])
    } finally {
      setWbLoading(false)
    }
  }

  if (selected) {
    const name = selected.workbook_path?.split(/[\\/]/).pop() || 'Workbook'
    return (
      <div>
        <div className="section-hdr">
          <div>
            <button className="btn btn-ghost btn-sm" onClick={()=>setSelected(null)} style={{ marginBottom: 8 }}>← Back</button>
            <h1>{name}</h1>
            <p style={{ marginTop: 4, wordBreak:'break-all' }}>{selected.workbook_path}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid-3" style={{ marginBottom: 24 }}>
          {[
            { icon:<svg className="icon" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>, val: selected.active_syncs ?? selected.total_syncs, lbl:'Total Syncs' },
            { icon:<svg className="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>, val: selected.total_fields_written, lbl:'Fields Written' },
            { icon:<svg className="icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>, val: selected.sheet_count, lbl:'Sheets' },
          ].map(s => (
            <div key={s.lbl} className="card" style={{ display:'flex', gap:12, alignItems:'center' }}>
              <span style={{ fontSize:24 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize:'1.5rem', fontWeight:700, color:'var(--text)' }}>{s.val ?? 0}</div>
                <div style={{ fontSize:11, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.6px' }}>{s.lbl}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Sync history for this workbook */}
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>Sync Sessions</h2>
          {wbLoading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:24 }}><div className="spinner"/></div>
          ) : wbHistory.length === 0 ? (
            <div className="empty"><span className="empty-icon"><svg className="icon icon-lg" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></span><p>No history.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Workbook</th><th>Row</th><th>Page URL</th><th>Fields</th><th>Status</th><th>Timestamp</th><th>Actions</th></tr></thead>
                <tbody>
                  {wbHistory.map(r => <SyncRow key={r.id} record={r} onUndo={() => openWorkbook(selected)} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="section-hdr" style={{ marginBottom: 24 }}>
        <div>
          <h1>Workbooks</h1>
          <p style={{ marginTop: 4 }}>{workbooks.length} workbooks tracked</p>
        </div>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}><div className="spinner"/></div>
      ) : workbooks.length === 0 ? (
        <div className="empty card">
          <span className="empty-icon"><svg className="icon icon-lg" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
          <p>No workbooks yet. Sync a page from the extension to get started.</p>
        </div>
      ) : (
        <div className="grid-3">
          {workbooks.map((wb, i) => (
            <WorkbookCard key={i} wb={wb} onClick={openWorkbook} />
          ))}
        </div>
      )}
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { historyApi } from '../api.js'
import SyncRow from '../components/SyncRow.jsx'

const PAGE_SIZE = 25

export default function History() {
  const [records, setRecords] = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(0)

  // Filters
  const [q,        setQ]        = useState('')
  const [wbFilter, setWbFilter] = useState('')
  const [urlFilter,setUrlFilter]= useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const load = useCallback(async (pg = 0) => {
    setLoading(true)
    try {
      const res = await historyApi.search({
        q, workbook_path: wbFilter, page_url: urlFilter,
        date_from: dateFrom, date_to: dateTo,
        limit: PAGE_SIZE, offset: pg * PAGE_SIZE,
      })
      setRecords(res.records || [])
      setTotal(res.total   || 0)
      setPage(pg)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [q, wbFilter, urlFilter, dateFrom, dateTo])

  useEffect(() => { load(0) }, [load])

  // CSV export
  const exportCSV = () => {
    const rows = [['ID','Timestamp','Workbook','Worksheet','Row','Page URL','Fields','Status']]
    records.forEach(r => {
      let fields = 0; try { fields = JSON.parse(r.fields_json||'[]').length } catch {}
      rows.push([r.id, r.ts, r.workbook_path, r.worksheet||'', r.row, r.page_url||'', fields, r.undone?'undone':'synced'])
    })
    const csv = rows.map(r => r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `sheetpilot_history_${Date.now()}.csv`
    a.click()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      <div className="section-hdr">
        <div>
          <h1>Sync History</h1>
          <p style={{ marginTop: 4 }}>{total} total records</p>
        </div>
        <button className="btn btn-ghost" onClick={exportCSV}><svg className="icon icon-sm" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export CSV</button>
      </div>

      {/* Search + filter bar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="search-bar">
          <input className="inp" placeholder="Search fields, URLs, workbooks…" value={q} onChange={e=>{setQ(e.target.value)}} />
        </div>
        <div className="filter-row">
          <div className="form-group">
            <label className="inp-label">Workbook</label>
            <input className="inp" placeholder="Filter by workbook path" value={wbFilter} onChange={e=>setWbFilter(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="inp-label">Page URL</label>
            <input className="inp" placeholder="Filter by page URL" value={urlFilter} onChange={e=>setUrlFilter(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="inp-label">From</label>
            <input className="inp" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="inp-label">To</label>
            <input className="inp" type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
          </div>
          <button className="btn btn-ghost" onClick={()=>{setQ('');setWbFilter('');setUrlFilter('');setDateFrom('');setDateTo('')}}>✕ Clear</button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:40 }}><div className="spinner"/></div>
      ) : records.length === 0 ? (
        <div className="empty card">
          <span className="empty-icon"><svg className="icon icon-lg" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></span>
          <p>No sync records found.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Workbook</th><th>Row</th><th>Page URL</th>
                <th>Fields</th><th>Status</th><th>Timestamp</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <SyncRow key={r.id} record={r} onUndo={() => load(page)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <span className="page-info">Page {page + 1} of {totalPages} · {total} records</span>
          <div className="page-btns">
            <button className="btn btn-ghost btn-sm" disabled={page===0} onClick={()=>load(page-1)}>← Prev</button>
            <button className="btn btn-ghost btn-sm" disabled={page>=totalPages-1} onClick={()=>load(page+1)}>Next →</button>
          </div>
        </div>
      )}
    </div>
  )
}

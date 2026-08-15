export default function WorkbookCard({ wb, onClick }) {
  const name = wb.workbook_path?.split(/[\\/]/).pop() || 'Workbook'
  const ts   = wb.last_synced_at ? new Date(wb.last_synced_at).toLocaleDateString() : '—'
  const isLocalDrive = wb.workbook_path?.match(/^[a-zA-Z]:/)

  return (
    <div className="card wb-card glow" onClick={() => onClick?.(wb)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ color: 'var(--green)' }}>
          <svg className="icon icon-lg" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </div>
        {isLocalDrive ? (
          <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontSize: 10 }}>
            Local Path
          </span>
        ) : (
          <span className="badge badge-active" style={{ fontSize: 10 }}>
            Cloud Ready
          </span>
        )}
      </div>
      <div className="wb-name">{name}</div>
      <div className="wb-path">{wb.workbook_path}</div>
      <div className="wb-stats">
        <div className="wb-stat">
          <div className="wb-stat-val">{wb.active_syncs ?? wb.total_syncs ?? 0}</div>
          <div className="wb-stat-lbl">Syncs</div>
        </div>
        <div className="wb-stat">
          <div className="wb-stat-val">{wb.total_fields_written ?? 0}</div>
          <div className="wb-stat-lbl">Fields</div>
        </div>
        <div className="wb-stat">
          <div className="wb-stat-val">{wb.sheet_count ?? 1}</div>
          <div className="wb-stat-lbl">Sheets</div>
        </div>
      </div>
      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-3)' }}>Last sync: {ts}</div>
    </div>
  )
}

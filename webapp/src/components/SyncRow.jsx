import { useState } from 'react'
import { commitApi } from '../api.js'
import { useToast } from '../App.jsx'

export default function SyncRow({ record, onUndo }) {
  const [expanded, setExpanded] = useState(false)
  const [undoing,  setUndoing]  = useState(false)
  const toast = useToast()

  let fields = []
  try { fields = JSON.parse(record.fields_json || '[]') } catch {}

  const handleUndo = async (e) => {
    e.stopPropagation()
    setUndoing(true)
    try {
      await commitApi.undo(record.workbook_path, record.id)
      toast.success(`Row ${record.row} restored.`)
      onUndo?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUndoing(false)
    }
  }

  const ts = new Date(record.ts)
  const timeStr = isNaN(ts) ? record.ts : ts.toLocaleString()
  const wbName = record.workbook_path?.split(/[\\/]/).pop() || record.workbook_path

  return (
    <>
      <tr onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer' }}>
        <td>
          <span title={record.workbook_path}>{wbName}</span>
          {record.worksheet && <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>· {record.worksheet}</span>}
        </td>
        <td style={{ color: 'var(--text-3)', fontSize: 12 }}>Row {record.row}</td>
        <td>
          {record.page_url
            ? <a href={record.page_url} target="_blank" rel="noreferrer"
                 style={{ fontSize: 12, maxWidth: 200, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                 onClick={e => e.stopPropagation()}
                 title={record.page_url}>{record.page_url}</a>
            : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>}
        </td>
        <td><span style={{ fontSize: 12 }}>{fields.length} fields</span></td>
        <td>
          <span className={`badge ${record.undone ? 'badge-undone' : 'badge-active'}`}>
            {record.undone ? 'undone' : 'synced'}
          </span>
        </td>
        <td style={{ color: 'var(--text-3)', fontSize: 11 }}>{timeStr}</td>
        <td onClick={e => e.stopPropagation()}>
          {!record.undone && (
            <button className="btn btn-ghost btn-sm" onClick={handleUndo} disabled={undoing}>
              {undoing ? '…' : '↩ Undo'}
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="expand-row">
          <td colSpan={7} className="expand-cell">
            {fields.length === 0
              ? <p>No field data.</p>
              : <div className="field-grid">
                  {fields.map((f, i) => (
                    <div key={i} className="field-item">
                      <div className="field-name">{f.field}</div>
                      <div className="field-value">{f.value || <em style={{ color: 'var(--text-3)' }}>empty</em>}</div>
                      {f.old_value && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Was: {f.old_value}</div>}
                    </div>
                  ))}
                </div>
            }
          </td>
        </tr>
      )}
    </>
  )
}

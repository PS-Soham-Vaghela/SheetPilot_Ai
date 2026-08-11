import { useState } from 'react'
import { useToast } from '../App.jsx'
import { systemApi } from '../api.js'

export default function Settings() {
  const toast = useToast()
  const [defaultWb,  setDefaultWb]  = useState(localStorage.getItem('sp_default_wb') || '')
  const [backendUrl, setBackendUrl]  = useState(localStorage.getItem('sp_backend_url') || 'http://localhost:8000')
  const [health,     setHealth]      = useState(null)
  const [checking,   setChecking]    = useState(false)

  const saveWb = () => { localStorage.setItem('sp_default_wb', defaultWb); toast.success('Default workbook saved.') }
  const saveBe = () => { localStorage.setItem('sp_backend_url', backendUrl); toast.success('Backend URL saved — refresh to apply.') }

  const checkHealth = async () => {
    setChecking(true); setHealth(null)
    try {
      const h = await systemApi.health()
      setHealth(h)
      toast.info(`Backend OK · Groq: ${h.ollama?.ok ? 'online' : 'offline'}`)
    } catch {
      toast.error('Backend unreachable.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Settings</h1>

      {/* Defaults */}
      <div className="card settings-section">
        <h2 style={{ marginBottom: 4 }}>Defaults</h2>
        <p style={{ marginBottom: 16 }}>Saved in your browser's local storage.</p>
        <div className="settings-row">
          <div className="settings-row-info">
            <h4>Default Workbook Path</h4>
            <p>Pre-fills the workbook path field on the Analyze page.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 320 }}>
            <input className="inp" value={defaultWb}
              onChange={e => setDefaultWb(e.target.value)}
              placeholder="C:\Users\...\Book1.xlsx" style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={saveWb}>Save</button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <h4>Backend URL</h4>
            <p>The FastAPI backend URL. Default: http://localhost:8000</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 320 }}>
            <input className="inp" value={backendUrl}
              onChange={e => setBackendUrl(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={saveBe}>Save</button>
          </div>
        </div>
      </div>

      {/* System */}
      <div className="card settings-section">
        <h2 style={{ marginBottom: 4 }}>System</h2>
        <p style={{ marginBottom: 16 }}>Backend and AI diagnostics.</p>
        <div className="settings-row">
          <div className="settings-row-info">
            <h4>Backend Health</h4>
            <p>
              {health
                ? `Status: ${health.status} · Groq: ${health.ollama?.ok ? '✓ online' : '✕ offline'} · ${health.ollama?.message || ''}`
                : 'Click Check to test connectivity.'}
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={checkHealth} disabled={checking}>
            {checking ? '…' : <><svg className="icon icon-sm" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> Check Now</>}
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <h4>Chrome Extension</h4>
            <p>Uses this same backend. Install from the <code>extension/</code> folder via chrome://extensions.</p>
          </div>
          <span className="badge badge-ai">Shared Backend</span>
        </div>
      </div>

      {/* About */}
      <div className="card">
        <h2 style={{ marginBottom: 12 }}>About</h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            ['Version',   'SheetPilot AI v3.0'],
            ['Backend',   'FastAPI + Python'],
            ['AI Model',  'Groq llama-3.1-8b-instant'],
            ['Storage',   'SQLite (sheetpilot_history.db)'],
            ['Extension', 'Chrome MV3'],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 3 }}>{k}</div>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

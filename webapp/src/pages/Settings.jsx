import { useState, useEffect } from 'react'
import { useToast } from '../App.jsx'
import { systemApi, workbooksApi } from '../api.js'

export default function Settings() {
  const toast = useToast()
  const [defaultWb,   setDefaultWb]   = useState(localStorage.getItem('sp_default_wb') || './sample_data/vendor_invoice.xlsx')
  const [backendUrl,  setBackendUrl]  = useState(localStorage.getItem('sp_backend_url') || import.meta.env.VITE_API_BASE || '')
  const [serverFiles, setServerFiles] = useState([])
  const [health,      setHealth]      = useState(null)
  const [checking,    setChecking]    = useState(false)

  const isLocalDrivePath = defaultWb?.match(/^[a-zA-Z]:/)

  useEffect(() => {
    workbooksApi.listUploads()
      .then(res => setServerFiles(res.files || []))
      .catch(() => {})
  }, [])

  const saveWb = () => {
    localStorage.setItem('sp_default_wb', defaultWb)
    localStorage.setItem('sp_cloud_wb', defaultWb)
    toast.success('Default workbook saved.')
  }

  const selectServerWb = (path) => {
    setDefaultWb(path)
    localStorage.setItem('sp_default_wb', path)
    localStorage.setItem('sp_cloud_wb', path)
    toast.success(`Selected ${path.split(/[/\\]/).pop()} as default workbook.`)
  }

  const saveBe = () => {
    localStorage.setItem('sp_backend_url', backendUrl)
    toast.success('Backend URL saved — refresh page to apply.')
  }

  const clearStorage = () => {
    localStorage.removeItem('sp_default_wb')
    localStorage.removeItem('sp_cloud_wb')
    localStorage.removeItem('sp_backend_url')
    setDefaultWb('./sample_data/vendor_invoice.xlsx')
    setBackendUrl(import.meta.env.VITE_API_BASE || '')
    toast.info('Stored local settings reset to defaults.')
  }

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
        <h2 style={{ marginBottom: 4 }}>Defaults & Paths</h2>
        <p style={{ marginBottom: 16 }}>Saved in your browser's local storage.</p>
        
        <div className="settings-row" style={{ alignItems: 'flex-start' }}>
          <div className="settings-row-info">
            <h4>Default Workbook Path</h4>
            <p>Active workbook for AI Sync and Chat Copilot.</p>
            {isLocalDrivePath && (
              <div style={{ marginTop: 6, color: 'var(--warning, #f59e0b)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>⚠️</span> Local paths (like <code>C:\</code>) only work when running locally. In cloud, use <code>./uploads/...</code> or <code>./sample_data/...</code>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 320, flex: 1, maxWidth: 440 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="inp" value={defaultWb}
                onChange={e => setDefaultWb(e.target.value)}
                placeholder="./sample_data/vendor_invoice.xlsx" style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={saveWb}>Save</button>
            </div>
            {serverFiles.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Quick pick:</span>
                {serverFiles.map(f => (
                  <button 
                    key={f.workbook_path} 
                    type="button" 
                    className={`btn btn-xs ${defaultWb === f.workbook_path ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => selectServerWb(f.workbook_path)}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                  >
                    {f.filename}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <h4>Backend API URL</h4>
            <p>The FastAPI backend URL. Leave empty to use auto-detected host.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 320, flex: 1, maxWidth: 440 }}>
            <input className="inp" value={backendUrl}
              placeholder="Auto / VITE_API_BASE"
              onChange={e => setBackendUrl(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={saveBe}>Save</button>
          </div>
        </div>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost btn-sm" onClick={clearStorage} style={{ color: 'var(--text-3)' }}>
            Reset Stored Settings to Default
          </button>
        </div>
      </div>

      {/* System */}
      <div className="card settings-section">
        <h2 style={{ marginBottom: 4 }}>System & Diagnostics</h2>
        <p style={{ marginBottom: 16 }}>Check connectivity to backend server and Groq AI inference.</p>
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
            <p>Sync web pages directly from your browser toolbar. Shared with this backend.</p>
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
            ['Storage',   'MongoDB Atlas'],
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

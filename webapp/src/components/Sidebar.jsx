import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { systemApi } from '../api.js'

export default function Sidebar() {
  const [backendOk, setBackendOk] = useState(null)

  useEffect(() => {
    let active = true
    const check = () => {
      systemApi.health()
        .then(() => { if (active) setBackendOk(true) })
        .catch(() => { if (active) setBackendOk(false) })
    }

    check()
    // Poll every 8 seconds if offline/checking, or every 30 seconds if online
    const interval = setInterval(check, backendOk ? 30000 : 8000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [backendOk])

  return (
    <aside className="sidebar">
      
      {/* App Info Card */}
      <div className="sidebar-card">
        <div className="sidebar-header">
          <div className="sidebar-header-icon" style={{ color: 'var(--text-main)' }}>
            <svg className="icon" style={{ strokeWidth: 2.5 }} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18M14 15l3-3-3-3M7 12h10"/></svg>
          </div>
          <div>
            <div className="sidebar-header-title">SheetPilot AI</div>
            <div className="sidebar-header-subtitle">Web-to-Excel Sync Engine</div>
          </div>
        </div>
        
        <div className="nav-grid">
          <div className="nav-grid-item" style={{ gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={`status-dot ${backendOk === true ? 'ok' : backendOk === false ? 'err' : ''}`} />
              <span className="nav-grid-item-label">Backend Status</span>
            </div>
            <div className="nav-grid-item-value">{backendOk === true ? 'Online' : backendOk === false ? 'Offline' : 'Checking…'}</div>
          </div>
          <NavLink to="/dashboard" className={({isActive}) => `nav-grid-item ${isActive ? 'active' : ''}`}>
            <svg className="icon icon-sm nav-grid-item-icon" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span className="nav-grid-item-label">Dashboard</span>
          </NavLink>
          <NavLink to="/editor" className={({isActive}) => `nav-grid-item ${isActive ? 'active' : ''}`}>
            <svg className="icon icon-sm nav-grid-item-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
            <span className="nav-grid-item-label">Sheet Editor</span>
          </NavLink>
          <NavLink to="/workbooks" className={({isActive}) => `nav-grid-item ${isActive ? 'active' : ''}`}>
            <svg className="icon icon-sm nav-grid-item-icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span className="nav-grid-item-label">Workbooks</span>
          </NavLink>
          <NavLink to="/history" className={({isActive}) => `nav-grid-item ${isActive ? 'active' : ''}`}>
            <svg className="icon icon-sm nav-grid-item-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <span className="nav-grid-item-label">History</span>
          </NavLink>
          <NavLink to="/settings" className={({isActive}) => `nav-grid-item ${isActive ? 'active' : ''}`}>
            <svg className="icon icon-sm nav-grid-item-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span className="nav-grid-item-label">Settings</span>
          </NavLink>
        </div>
      </div>

      {/* Sync Pipeline Card */}
      <div className="sidebar-card">
        <div className="sidebar-section-title">SYNC PIPELINE</div>
        
        <div className="pipeline-step active">
          <div className="pipeline-step-dot"></div>
          <div className="pipeline-step-line"></div>
          <div className="pipeline-step-content">
            <h4>Analyze</h4>
            <p>Scrape web data</p>
          </div>
        </div>
        
        <div className="pipeline-step">
          <div className="pipeline-step-dot"></div>
          <div className="pipeline-step-line"></div>
          <div className="pipeline-step-content">
            <h4>Extract</h4>
            <p>LLM processing</p>
          </div>
        </div>
        
        <div className="pipeline-step">
          <div className="pipeline-step-dot"></div>
          <div className="pipeline-step-line"></div>
          <div className="pipeline-step-content">
            <h4>Format</h4>
            <p>JSON structure</p>
          </div>
        </div>
        
        <div className="pipeline-step">
          <div className="pipeline-step-dot"></div>
          <div className="pipeline-step-line"></div>
          <div className="pipeline-step-content">
            <h4>Sync</h4>
            <p>Write to Workbook</p>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="sidebar-card">
        <div className="sidebar-section-title">TIPS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="badge gray">Ctrl K</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>to search</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="badge gray">Enter</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>to submit URL</span>
          </div>
        </div>
      </div>
      
    </aside>
  )
}

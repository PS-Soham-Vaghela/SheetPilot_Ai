import { useLocation, useNavigate } from 'react-router-dom'

export default function Navbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  return (
    <div className="floating-navbar-container">
      <div className="floating-navbar">
        <div className="navbar-brand">
          <svg className="icon" style={{ marginRight: 8, color: 'var(--text-main)', strokeWidth: 2.5 }} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18M14 15l3-3-3-3M7 12h10"/></svg>
          SheetPilot AI
        </div>
        
        <div className="navbar-actions">
          <button className="nav-btn" onClick={() => navigate('/analyze')}>
            <svg className="icon icon-sm" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            Upload
          </button>
          
          <button className="nav-btn" onClick={() => window.location.reload()}>
            <svg className="icon icon-sm" viewBox="0 0 24 24"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
            Rebuild
          </button>

          <button className="nav-btn" onClick={() => { localStorage.removeItem('sp_default_wb'); window.location.reload(); }}>
            <svg className="icon icon-sm" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Clear
          </button>
          
          <button className="nav-btn primary" onClick={() => navigate('/analyze')}>
            <svg className="icon icon-sm" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            New
          </button>

          <button className="nav-btn" onClick={() => navigate('/workbooks')}>
            <svg className="icon icon-sm" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Files
          </button>
        </div>
      </div>
    </div>
  )
}

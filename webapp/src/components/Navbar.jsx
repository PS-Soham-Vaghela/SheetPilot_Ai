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
          <button className={`nav-btn ${pathname === '/editor' ? 'primary' : ''}`} onClick={() => navigate('/editor')}>
            <svg className="icon icon-sm" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
            Sheet Editor
          </button>
          
          <button className={`nav-btn ${pathname === '/analyze' ? 'primary' : ''}`} onClick={() => navigate('/analyze')}>
            <svg className="icon icon-sm" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            AI Sync
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

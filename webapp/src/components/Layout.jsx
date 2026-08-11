import Sidebar from './Sidebar.jsx'
import Navbar  from './Navbar.jsx'

export default function Layout({ children }) {
  return (
    <>
      <Navbar />
      <div className="app-shell">
        <Sidebar />
        <div className="main-content">
          <div className="page-inner fade-in">
            {children}
          </div>
        </div>
      </div>
    </>
  )
}

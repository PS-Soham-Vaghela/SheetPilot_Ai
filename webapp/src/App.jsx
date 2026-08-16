import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, createContext, useContext } from 'react'
import Toast from './components/Toast.jsx'

// ── Toast context ─────────────────────────────────────────────────────────────
const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx)

// ── Pages ─────────────────────────────────────────────────────────────────────
import Dashboard from './pages/Dashboard.jsx'
import History   from './pages/History.jsx'
import Workbooks from './pages/Workbooks.jsx'
import Editor    from './pages/Editor.jsx'
import Analyze   from './pages/Analyze.jsx'
import Settings  from './pages/Settings.jsx'
import Layout    from './components/Layout.jsx'

export default function App() {
  const [toasts, setToasts] = useState([])

  const addToast = (msg, type = 'info') => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }
  const toast = {
    success: m => addToast(m, 'success'),
    error:   m => addToast(m, 'error'),
    info:    m => addToast(m, 'info'),
  }

  return (
    <ToastCtx.Provider value={toast}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="editor"    element={<Editor />} />
            <Route path="history"   element={<History />} />
            <Route path="workbooks" element={<Workbooks />} />
            <Route path="analyze"   element={<Analyze />} />
            <Route path="settings"  element={<Settings />} />
            <Route path="*"         element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
      <Toast toasts={toasts} />
    </ToastCtx.Provider>
  )
}

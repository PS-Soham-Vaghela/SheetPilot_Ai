import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardApi, chatApi } from '../api.js'

export default function Dashboard() {
  const navigate  = useNavigate()
  const [recent,  setRecent]  = useState([])
  const [loading, setLoading] = useState(true)
  const [urlInput, setUrlInput] = useState('')
  const [activeTab, setActiveTab] = useState('sync') // 'sync' | 'chat'
  
  // Chat state
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I can answer questions about your active spreadsheet workbook. Ask me anything!' }
  ])
  const [chatLoading, setChatLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const defaultWb = localStorage.getItem('sp_default_wb') || './sample_data/vendor_invoice.xlsx'
  const activeWb = localStorage.getItem('sp_default_wb') || (recent.length > 0 ? recent[0].workbook_path : './sample_data/vendor_invoice.xlsx')

  useEffect(() => {
    dashboardApi.recent(8)
      .then(r => setRecent(r.recent || []))
      .catch(() => setRecent([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // Scroll chat to bottom on new messages
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleAnalyze = (e) => {
    e.preventDefault()
    if (!urlInput.trim()) return
    navigate(`/analyze?url=${encodeURIComponent(urlInput.trim())}`)
  }

  const handleChatSubmit = async (e) => {
    e.preventDefault()
    if (!chatInput.trim() || chatLoading) return

    const userQuery = chatInput.trim()
    setChatInput('')
    setMessages(prev => [...prev, { role: 'user', content: userQuery }])
    
    if (!activeWb) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Please configure a default workbook path first on the Analyze page or Settings tab to enable spreadsheet chat.'
      }])
      return
    }

    setChatLoading(true)
    try {
      const data = await chatApi.workbook(activeWb, userQuery)
      if (data.response) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.detail || 'Failed to retrieve answer from the workbook.' }])
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: err.message || 'Connection error. Make sure the backend server is running.' }])
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <div className="dashboard-container">
      {/* Center Section */}
      <div className="dashboard-hero-section">
        {/* Navigation Tabs */}
        <div className="chat-tab-group">
          <button 
            className={`chat-tab-btn ${activeTab === 'sync' ? 'active' : ''}`}
            onClick={() => setActiveTab('sync')}
          >
            AI Sync
          </button>
          <button 
            className={`chat-tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat Copilot
          </button>
        </div>

        {activeTab === 'sync' ? (
          <>
            <div className="hero-section">
              <h1>Your data, automated.</h1>
              <p>Synthesizing intelligence from your web research with precision.</p>
            </div>

            <div className="action-chips">
              <button className="action-chip" onClick={() => navigate('/history')}>View History</button>
              <button className="action-chip" onClick={() => navigate('/workbooks')}>Browse Workbooks</button>
              <button className="action-chip" onClick={() => navigate('/settings')}>Settings</button>
            </div>

            <div className="input-bar-container">
              <form className="input-bar" onSubmit={handleAnalyze}>
                <svg className="icon input-bar-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                <input 
                  type="url" 
                  placeholder="Enter a URL to analyze..." 
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  required
                />
                <button type="submit" className="input-bar-submit">
                  <svg className="icon icon-sm" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
              </form>
              <div className="input-hint">Enter to send · Ctrl K to focus</div>
            </div>
          </>
        ) : (
          <div className="chat-panel">
            <div className="chat-messages">
              {messages.map((m, idx) => (
                <div key={idx} className={`chat-bubble ${m.role}`}>
                  {m.content}
                </div>
              ))}
              {chatLoading && (
                <div className="chat-bubble assistant" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div className="spinner" style={{ borderTopColor: 'var(--accent-text)', width: 14, height: 14 }} />
                  Analyzing spreadsheet...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <form className="chat-input-bar" onSubmit={handleChatSubmit}>
              <input 
                type="text" 
                placeholder={activeWb ? "Ask a question about your workbook..." : "Configure a workbook path first..."}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={!activeWb || chatLoading}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={!activeWb || chatLoading} style={{ borderRadius: 'var(--radius-full)' }}>
                Ask
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Right Sidebar (SOURCES equivalent) */}
      <div className="right-sidebar">
        <div className="sources-card">
          <div className="sources-header">
            <div className="sources-title">
              <svg className="icon icon-sm" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              RECENT SYNCS
            </div>
            <svg className="icon icon-sm" style={{ color: 'var(--text-light)' }} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          </div>
          
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 40 }}>
              <div className="spinner" />
            </div>
          ) : recent.length === 0 ? (
            <div className="sources-empty">
              <svg className="icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <p>Recent sync records will appear here after each analysis.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', flex: 1 }}>
              {recent.map(r => {
                const wbName = r.workbook_path?.split(/[\\/]/).pop() || 'Unknown'
                let fields = 0
                try { fields = JSON.parse(r.fields_json || '[]').length } catch {}
                
                let hostname = 'Unknown'
                try {
                  hostname = new URL(r.page_url).hostname.replace('www.', '')
                } catch {
                  hostname = r.page_url || 'Unknown'
                }
                
                return (
                  <div key={r.id} className="recent-sync-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-main)' }} title={r.url}>
                        {hostname}
                      </span>
                      <span style={{ color: 'var(--green)', fontWeight: 600 }}>+{fields} fields</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {wbName}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

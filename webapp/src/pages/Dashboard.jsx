import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardApi, chatApi, workbooksApi } from '../api.js'

export default function Dashboard() {
  const navigate  = useNavigate()
  const [recent,  setRecent]  = useState([])
  const [loading, setLoading] = useState(true)
  const [urlInput, setUrlInput] = useState('')
  const [activeTab, setActiveTab] = useState('sync') // 'sync' | 'chat'
  
  // Available server workbooks
  const [serverFiles, setServerFiles] = useState([])
  
  // Chat state
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I can answer questions about your active spreadsheet workbook. Ask me anything!' }
  ])
  const [chatLoading, setChatLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const isCloud = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
  const savedWb = localStorage.getItem('sp_cloud_wb') || localStorage.getItem('sp_default_wb')
  
  const [selectedWb, setSelectedWb] = useState(savedWb || './sample_data/vendor_invoice.xlsx')

  useEffect(() => {
    dashboardApi.recent(8)
      .then(r => setRecent(r.recent || []))
      .catch(() => setRecent([]))
      .finally(() => setLoading(false))

    // Fetch available server files
    workbooksApi.listUploads()
      .then(res => {
        const files = res.files || []
        setServerFiles(files)
        if (files.length > 0) {
          // If current selection is invalid or local windows path in cloud
          const isInvalidLocal = isCloud && selectedWb?.match(/^[a-zA-Z]:/)
          const fileExists = files.some(f => f.workbook_path === selectedWb)
          if (!fileExists || isInvalidLocal) {
            const firstUpload = files.find(f => f.type === 'uploaded') || files[0]
            if (firstUpload) {
              setSelectedWb(firstUpload.workbook_path)
              localStorage.setItem('sp_cloud_wb', firstUpload.workbook_path)
            }
          }
        }
      })
      .catch(() => {})
  }, [isCloud])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleWbChange = (e) => {
    const val = e.target.value
    setSelectedWb(val)
    localStorage.setItem('sp_cloud_wb', val)
    localStorage.setItem('sp_default_wb', val)
  }

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
    
    if (!selectedWb) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Please select or upload a workbook first to enable spreadsheet chat.'
      }])
      return
    }

    setChatLoading(true)
    try {
      const data = await chatApi.workbook(selectedWb, userQuery)
      if (data.response) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.detail || 'Failed to retrieve answer from the workbook.' }])
      }
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '⚠️ This workbook is not found on the server (it may have been lost after a server restart). Please upload your file on the Analyze page.'
        }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: msg || 'Connection error. Make sure the backend server is running.' }])
      }
    } finally {
      setChatLoading(false)
    }
  }

  const activeWbName = selectedWb ? selectedWb.split(/[\\/]/).pop() : 'No workbook selected'

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
              <button className="action-chip" onClick={() => navigate('/analyze')}>Analyze URL</button>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-card, #f8f9fa)', borderRadius: 'var(--radius-md, 8px)', fontSize: '0.8rem', color: 'var(--text-muted, #666)', marginBottom: 8, border: '1px solid var(--border, #eee)', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200 }}>
                <span>Spreadsheet:</span>
                {serverFiles.length > 0 ? (
                  <select 
                    value={selectedWb} 
                    onChange={handleWbChange}
                    className="inp"
                    style={{ padding: '2px 8px', fontSize: '0.8rem', height: 28, flex: 1, maxWidth: 260 }}
                  >
                    {serverFiles.map(f => (
                      <option key={f.workbook_path} value={f.workbook_path}>
                        {f.type === 'uploaded' ? '📁 ' : '📄 '} {f.filename}
                      </option>
                    ))}
                  </select>
                ) : (
                  <strong style={{ color: 'var(--text-main, #111)' }}>{activeWbName}</strong>
                )}
              </div>
              <button className="btn btn-ghost btn-xs" onClick={() => navigate('/analyze')} style={{ fontSize: '0.75rem', padding: '2px 8px' }}>+ Upload New</button>
            </div>
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
                placeholder={selectedWb ? `Ask a question about ${activeWbName}...` : "Upload a workbook first..."}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={!selectedWb || chatLoading}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={!selectedWb || chatLoading} style={{ borderRadius: 'var(--radius-full)' }}>
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
                      <span style={{ fontWeight: 600, color: 'var(--text-main)' }} title={r.page_url}>
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

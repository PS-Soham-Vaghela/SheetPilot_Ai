import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, saveToken } from '../api.js'
import { useAuth } from '../App.jsx'

export default function Login() {
  const [tab,    setTab]    = useState('login')    // 'login' | 'register'
  const [email,  setEmail]  = useState('')
  const [pass,   setPass]   = useState('')
  const [error,  setError]  = useState('')
  const [loading,setLoading]= useState(false)
  const { login } = useAuth()
  const navigate  = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = tab === 'login'
        ? await authApi.login(email, pass)
        : await authApi.register(email, pass)
      saveToken(res.token)
      login(res)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card card fade-in">
        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-icon">📊</div>
          <div className="login-logo-text">SheetPilot AI</div>
        </div>

        {/* Tabs */}
        <div className="login-tabs">
          <button className={`login-tab ${tab==='login'?'active':''}`} onClick={()=>{setTab('login');setError('')}}>Sign In</button>
          <button className={`login-tab ${tab==='register'?'active':''}`} onClick={()=>{setTab('register');setError('')}}>Create Account</button>
        </div>

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="inp-label">Email</label>
            <input className="inp" type="email" placeholder="you@example.com"
              value={email} onChange={e=>setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="form-group">
            <label className="inp-label">Password</label>
            <input className="inp" type="password" placeholder={tab==='register'?'Min. 6 characters':'Your password'}
              value={pass} onChange={e=>setPass(e.target.value)} required />
          </div>
          {error && <div className="form-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}
          <button className="btn btn-primary" style={{ width: '100%', padding: '12px' }} type="submit" disabled={loading}>
            {loading ? '…' : tab === 'login' ? 'Sign In →' : 'Create Account →'}
          </button>
        </form>

        <div className="login-footer">
          {tab === 'login'
            ? <>No account? <button className="btn btn-ghost btn-sm" onClick={()=>setTab('register')}>Register</button></>
            : <>Already have an account? <button className="btn btn-ghost btn-sm" onClick={()=>setTab('login')}>Sign In</button></>
          }
        </div>
      </div>
    </div>
  )
}

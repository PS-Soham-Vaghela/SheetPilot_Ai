export default function StatCard({ icon, value, label, change, color = 'var(--accent)' }) {
  return (
    <div className="card stat-card glow fade-in" style={{ '--card-color': color }}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value ?? <span className="spinner" style={{ width:20, height:20, display:'inline-block' }} />}</div>
      <div className="stat-label">{label}</div>
      {change && <div className="stat-change">↑ {change}</div>}
    </div>
  )
}

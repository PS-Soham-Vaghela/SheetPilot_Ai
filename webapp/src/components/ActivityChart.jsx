export default function ActivityChart({ data = [] }) {
  if (!data.length) return (
    <div className="empty" style={{ height: 120 }}>
      <span className="empty-icon"><svg className="icon icon-lg" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg></span>
      <p>No activity yet</p>
    </div>
  )

  const max = Math.max(...data.map(d => d.syncs), 1)
  const W = 600, H = 110, pad = { t: 10, b: 24, l: 8, r: 8 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b

  const pts = data.map((d, i) => ({
    x: pad.l + (i / Math.max(data.length - 1, 1)) * innerW,
    y: pad.t + innerH - (d.syncs / max) * innerH,
    day: d.day, syncs: d.syncs,
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${pts[pts.length-1].x.toFixed(1)},${(H-pad.b).toFixed(1)} L${pts[0].x.toFixed(1)},${(H-pad.b).toFixed(1)} Z`

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#4f46e5" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path d={areaPath} className="chart-area" />
        <path d={linePath} className="chart-line" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#4f46e5" />
        ))}
        {/* X-axis labels — show first, mid, last */}
        {[0, Math.floor(pts.length/2), pts.length-1].filter((v,i,a)=>a.indexOf(v)===i).map(i => (
          <text key={i} x={pts[i].x} y={H-4} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.3)">
            {pts[i].day?.slice(5)}
          </text>
        ))}
      </svg>
    </div>
  )
}

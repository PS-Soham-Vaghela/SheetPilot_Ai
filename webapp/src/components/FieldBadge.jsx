export default function FieldBadge({ confidence }) {
  const c = (confidence || '').toLowerCase()
  return <span className={`badge badge-${c}`}>{c}</span>
}

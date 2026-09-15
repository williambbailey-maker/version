/** Eight-spoke mark, the small logo beside the nav pills. */
export function Mark({ className = 'h-12 w-12' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g fill="#111111">
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="41" y="0" width="18" height="52" rx="9" transform={`rotate(${i * 45} 50 50)`} />
        ))}
        <circle cx="50" cy="50" r="12" fill="#efebe3" />
      </g>
    </svg>
  )
}

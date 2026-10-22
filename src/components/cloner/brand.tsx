/**
 * Clonethat brand assets — the "code bracket C" mark and the
 * JetBrains-Mono wordmark (accent = teal-400 / #2dd4bf, the neon-mint
 * from the logo spec).
 */

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* ghosted bracket */}
      <path
        d="M13 4L9 4C7.89543 4 7 4.89543 7 6V18C7 19.1046 7.89543 20 9 20H13"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.3"
      />
      {/* main bracket */}
      <path
        d="M10 4L6 4C4.89543 4 4 4.89543 4 6V18C4 19.1046 4.89543 20 6 20H10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* inner cursor */}
      <path d="M14 9L19 12L14 15V9Z" fill="currentColor" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`font-brand font-bold tracking-tight ${className ?? ''}`}>
      clone<span className="text-teal-400">{'{that}'}</span>
    </span>
  )
}

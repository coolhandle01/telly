import type { CSSProperties, ReactNode } from 'react'

const boxStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeContent: 'center',
  gap: '0.75rem',
  padding: '2rem',
  background: '#000',
  color: '#e8e8e8',
  font: '500 1.1rem/1.5 ui-monospace, "Cascadia Mono", Menlo, monospace',
  letterSpacing: '0.08em',
  textAlign: 'center',
  textTransform: 'uppercase',
}

/** Continuity: white-on-black, in the voice of an announcement. */
export function Caption({ role = 'status', children }: { role?: string; children: ReactNode }) {
  return (
    <div style={boxStyle} role={role}>
      {children}
    </div>
  )
}

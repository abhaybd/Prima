import type { Color } from '../types/config'
import { formatClock } from '../lib/clocks'
import type { ClockState } from '../lib/clocks'
import styles from './Clocks.module.css'

interface Props {
  clocks: ClockState
  userColor: Color
}

function ClockFace({
  label,
  ms,
  active,
  user,
}: {
  label: string
  ms: number
  active: boolean
  user: boolean
}) {
  const low = ms < 15000
  return (
    <div className={`${styles.clock} ${active ? styles.active : ''} ${low ? styles.low : ''}`}>
      <div className={styles.label}>
        {label}
        {user ? ' · you' : ''}
      </div>
      <div className={styles.time}>{formatClock(ms)}</div>
    </div>
  )
}

export function Clocks({ clocks, userColor }: Props) {
  const top: Color = userColor === 'w' ? 'b' : 'w'
  const bottom: Color = userColor
  return (
    <div className={styles.stack}>
      <ClockFace
        label={top === 'w' ? 'White' : 'Black'}
        ms={clocks[top]}
        active={clocks.running === top}
        user={false}
      />
      <ClockFace
        label={bottom === 'w' ? 'White' : 'Black'}
        ms={clocks[bottom]}
        active={clocks.running === bottom}
        user
      />
    </div>
  )
}

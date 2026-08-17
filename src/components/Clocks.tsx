import type { Color } from '../types/config'
import { formatClock } from '../lib/clocks'
import type { ClockState } from '../lib/clocks'
import styles from './Clocks.module.css'

interface Props {
  clocks: ClockState
  userColor: Color
}

export function Clocks({ clocks, userColor }: Props) {
  const ms = clocks[userColor]
  const active = clocks.running === userColor
  const low = ms < 15000
  return (
    <div className={`${styles.clock} ${active ? styles.active : ''} ${low ? styles.low : ''}`}>
      <div className={styles.label}>Time</div>
      <div className={styles.time}>{formatClock(ms)}</div>
    </div>
  )
}

import { useState } from 'react'
import styles from './FreezeOverlay.module.css'

interface Props {
  retries: number
  maxRetries: number
}

export function FreezeOverlay({ retries, maxRetries }: Props) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const dismiss = () => setDismissed(true)

  return (
    <div
      className={styles.banner}
      role="button"
      tabIndex={0}
      onClick={dismiss}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          dismiss()
        }
      }}
    >
      <div className={styles.title}>Frozen</div>
      <p className={styles.body}>Play a move to continue.</p>
      <div className={styles.meta}>
        Attempt {Math.min(retries, maxRetries)} / {maxRetries}
      </div>
      <div className={styles.dismiss}>Click to hide</div>
    </div>
  )
}

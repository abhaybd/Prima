import styles from './FreezeOverlay.module.css'

interface Props {
  retries: number
  maxRetries: number
}

export function FreezeOverlay({ retries, maxRetries }: Props) {
  return (
    <div className={styles.overlay} role="status">
      <div className={styles.card}>
        <div className={styles.title}>Frozen</div>
        <p className={styles.body}>Play a move to continue.</p>
        <div className={styles.meta}>
          Attempt {Math.min(retries, maxRetries)} / {maxRetries}
        </div>
      </div>
    </div>
  )
}

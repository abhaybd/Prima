import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { debugHref, useDebugMode } from '../lib/debug'
import { hasSeenWelcome, markWelcomeSeen } from '../store/welcome'
import styles from './WelcomeDialog.module.css'

export function WelcomeDialog() {
  const debug = useDebugMode()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || hasSeenWelcome()) return
    if (!dialog.open) dialog.showModal()
    const onClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close()
    }
    dialog.addEventListener('click', onClick)
    return () => dialog.removeEventListener('click', onClick)
  }, [])

  function close() {
    dialogRef.current?.close()
  }

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={markWelcomeSeen}>
      <div className={styles.body}>
        <h2>Welcome</h2>
        <p>
          A blitz trainer for acceptable play under time pressure, not engine-perfect moves. After
          you move, the position may freeze if a stronger player would rarely choose it — undo and
          try again.
        </p>
        <p>
          Further information is on the{' '}
          <Link to={debugHref('/about', debug)} onClick={close}>
            About
          </Link>{' '}
          page.
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={close}>
            Got it
          </button>
        </div>
      </div>
    </dialog>
  )
}

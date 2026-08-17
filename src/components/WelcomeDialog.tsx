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
        <h2>Welcome to Prima</h2>
        <p>
          Prima is short for <em>prima facie</em> — from first look — because it trains the kind of
          chess you play when the clock is ticking: acceptable moves on sight, not engine-perfect
          ones.
        </p>
        <p>
          You play blitz against a human-like bot. After each of your moves, the app asks whether a
          stronger player would also choose it. If not, the position freezes — the move is undone,
          and you try again. Freezes are meant to interrupt sloppy intuition, not to coach you
          through the position.
        </p>
        <p>
          The{' '}
          <Link to={debugHref('/about', debug)} onClick={close}>
            About
          </Link>{' '}
          page has the rest: how scoring works, why some freezes are decoys, and what stays on this
          browser.
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

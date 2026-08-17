import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { debugHref, useDebugMode } from '../lib/debug'
import { Credits } from './Credits'
import { WelcomeDialog } from './WelcomeDialog'
import styles from './Layout.module.css'

export function Layout({ children }: { children: ReactNode }) {
  const debug = useDebugMode()
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <NavLink to={debugHref('/', debug)} className={styles.brand}>
          Prima
          {debug ? <span className={styles.debugBadge}>DEBUG</span> : null}
        </NavLink>
        <nav className={styles.nav}>
          <NavLink to={debugHref('/', debug)} end>
            Play
          </NavLink>
          <NavLink to={debugHref('/dashboard', debug)}>Dashboard</NavLink>
          <NavLink to={debugHref('/about', debug)}>About</NavLink>
          <NavLink to={debugHref('/settings', debug)}>Settings</NavLink>
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <Credits />
      </footer>
      <WelcomeDialog />
    </div>
  )
}

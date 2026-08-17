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
        <a
          className={styles.bugLink}
          href="https://github.com/abhaybd/Prima/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          File a bug
          <svg
            className={styles.externalIcon}
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-3.5a.75.75 0 0 1 1.5 0v3.5A2.25 2.25 0 0 1 12.25 15h-8.5A2.25 2.25 0 0 1 1.5 12.75v-8.5A2.25 2.25 0 0 1 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"
            />
          </svg>
        </a>
      </footer>
      <WelcomeDialog />
    </div>
  )
}

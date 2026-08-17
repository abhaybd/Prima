import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Credits } from './Credits'
import styles from './Layout.module.css'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <NavLink to="/" className={styles.brand}>
          Blitz Freeze Drill
        </NavLink>
        <nav className={styles.nav}>
          <NavLink to="/" end>
            Play
          </NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <Credits />
      </footer>
    </div>
  )
}

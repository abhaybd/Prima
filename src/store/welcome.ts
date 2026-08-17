import { CONFIG_STORAGE_KEY } from '../types/config'

export const WELCOME_STORAGE_KEY = 'prima.welcome.v1'

export function hasSeenWelcome(): boolean {
  try {
    if (localStorage.getItem(WELCOME_STORAGE_KEY)) return true
    // Returning visitors already have settings from an earlier session.
    if (localStorage.getItem(CONFIG_STORAGE_KEY)) return true
    return false
  } catch {
    return true
  }
}

export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(WELCOME_STORAGE_KEY, '1')
  } catch {
    // Ignore quota / private-mode failures; the next visit may show it again.
  }
}

export function clearWelcomeSeen(): void {
  try {
    localStorage.removeItem(WELCOME_STORAGE_KEY)
  } catch {
    // ignore
  }
}

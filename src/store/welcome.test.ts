import { afterEach, describe, expect, it } from 'vitest'
import { CONFIG_STORAGE_KEY } from '../types/config'
import {
  WELCOME_STORAGE_KEY,
  clearWelcomeSeen,
  hasSeenWelcome,
  markWelcomeSeen,
} from './welcome'

function mockLocalStorage() {
  const memory = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => memory.set(k, v),
      removeItem: (k: string) => memory.delete(k),
    },
    configurable: true,
  })
  return memory
}

describe('welcome seen flag', () => {
  afterEach(() => {
    globalThis.localStorage?.removeItem(WELCOME_STORAGE_KEY)
    globalThis.localStorage?.removeItem(CONFIG_STORAGE_KEY)
  })

  it('is unseen when the browser has no app data', () => {
    mockLocalStorage()
    expect(hasSeenWelcome()).toBe(false)
  })

  it('is seen after the dialog is dismissed', () => {
    mockLocalStorage()
    markWelcomeSeen()
    expect(hasSeenWelcome()).toBe(true)
  })

  it('treats an existing settings key as a returning visitor', () => {
    const memory = mockLocalStorage()
    memory.set(CONFIG_STORAGE_KEY, '{}')
    expect(hasSeenWelcome()).toBe(true)
  })

  it('can be cleared so the next visit is treated as first-time', () => {
    mockLocalStorage()
    markWelcomeSeen()
    clearWelcomeSeen()
    expect(hasSeenWelcome()).toBe(false)
  })
})

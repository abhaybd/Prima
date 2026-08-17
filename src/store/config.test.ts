import { afterEach, describe, expect, it } from 'vitest'
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from '../types/config'
import { loadConfig, mergeConfig, saveConfig } from './config'

describe('config persistence', () => {
  afterEach(() => {
    globalThis.localStorage?.removeItem(CONFIG_STORAGE_KEY)
  })

  it('returns defaults when empty', () => {
    const memory = new Map<string, string>()
    const ls = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, v)
      },
      removeItem: (k: string) => {
        memory.delete(k)
      },
    }
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })
    expect(loadConfig().tauRatio).toBe(DEFAULT_CONFIG.tauRatio)
    expect(loadConfig().timeControl).toEqual({ initial: 180, increment: 0 })
  })

  it('keeps unknown keys from wiping defaults', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { tauRatio: 0.4 } as Partial<typeof DEFAULT_CONFIG>)
    expect(merged.tauRatio).toBe(0.4)
    expect(merged.thresholdElo).toBe(2000)
  })

  it('round-trips through save/load', () => {
    const memory = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => memory.set(k, v),
        removeItem: (k: string) => memory.delete(k),
      },
      configurable: true,
    })
    saveConfig({ ...DEFAULT_CONFIG, userElo: 1800, timeControl: { initial: 60, increment: 1 } })
    expect(loadConfig().userElo).toBe(1800)
    expect(loadConfig().timeControl.increment).toBe(1)
  })
})

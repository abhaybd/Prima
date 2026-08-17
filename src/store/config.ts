import {
  CONFIG_STORAGE_KEY,
  DEFAULT_CONFIG,
  type Config,
  type FreezeClockMode,
  type MaiaVariant,
  type OpponentSampleMode,
  type UserColorPref,
} from '../types/config'

function isFreezeClockMode(v: unknown): v is FreezeClockMode {
  return v === 'penalty' || v === 'running' || v === 'paused' || v === 'grace'
}

function isUserColor(v: unknown): v is UserColorPref {
  return v === 'w' || v === 'b' || v === 'random'
}

function isMaiaVariant(v: unknown): v is MaiaVariant {
  return v === '23m' || v === '5m'
}

function isOpponentSampleMode(v: unknown): v is OpponentSampleMode {
  return v === 'nucleus' || v === 'argmax'
}

function topP(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(1, Math.max(0.01, v))
}

function cloneDefault(): Config {
  return { ...DEFAULT_CONFIG, timeControl: { ...DEFAULT_CONFIG.timeControl } }
}

export function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (!raw) return cloneDefault()
    const parsed = JSON.parse(raw) as Partial<Config>
    const version = typeof parsed.configVersion === 'number' ? parsed.configVersion : 1
    if (version < 2 && parsed.opponentElo === 1500) {
      parsed.opponentElo = 1000
    }
    const merged = mergeConfig(DEFAULT_CONFIG, parsed)
    if (version < DEFAULT_CONFIG.configVersion) saveConfig(merged)
    return merged
  } catch {
    return cloneDefault()
  }
}

export function saveConfig(config: Config): void {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
}

export function clearConfig(): void {
  localStorage.removeItem(CONFIG_STORAGE_KEY)
}

export function mergeConfig(base: Config, patch: Partial<Config>): Config {
  const timeControl = {
    initial: patch.timeControl?.initial ?? base.timeControl.initial,
    increment: patch.timeControl?.increment ?? base.timeControl.increment,
  }
  return {
    configVersion: Math.max(num(patch.configVersion, base.configVersion), base.configVersion),
    opponentElo: num(patch.opponentElo, base.opponentElo),
    thresholdElo: num(patch.thresholdElo, base.thresholdElo),
    tauRatio: num(patch.tauRatio, base.tauRatio),
    maxRetries: num(patch.maxRetries, base.maxRetries),
    freezeClockMode: isFreezeClockMode(patch.freezeClockMode)
      ? patch.freezeClockMode
      : base.freezeClockMode,
    freezePenaltySeconds: num(patch.freezePenaltySeconds, base.freezePenaltySeconds),
    freezeGraceSeconds: num(patch.freezeGraceSeconds, base.freezeGraceSeconds),
    decoyFreezeRate: num(patch.decoyFreezeRate, base.decoyFreezeRate),
    timeControl,
    userColor: isUserColor(patch.userColor) ? patch.userColor : base.userColor,
    maiaVariant: isMaiaVariant(patch.maiaVariant) ? patch.maiaVariant : base.maiaVariant,
    opponentSampleMode: isOpponentSampleMode(patch.opponentSampleMode)
      ? patch.opponentSampleMode
      : base.opponentSampleMode,
    opponentTopP: topP(patch.opponentTopP, base.opponentTopP),
  }
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

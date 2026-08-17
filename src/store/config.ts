import {
  CONFIG_STORAGE_KEY,
  DEFAULT_CONFIG,
  type Config,
  type FreezeClockMode,
  type MaiaVariant,
  type UserColorPref,
} from '../types/config'

function isFreezeClockMode(v: unknown): v is FreezeClockMode {
  return v === 'penalty' || v === 'running' || v === 'paused'
}

function isUserColor(v: unknown): v is UserColorPref {
  return v === 'w' || v === 'b' || v === 'random'
}

function isMaiaVariant(v: unknown): v is MaiaVariant {
  return v === '23m' || v === '5m'
}

export function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONFIG, timeControl: { ...DEFAULT_CONFIG.timeControl } }
    const parsed = JSON.parse(raw) as Partial<Config>
    return mergeConfig(DEFAULT_CONFIG, parsed)
  } catch {
    return { ...DEFAULT_CONFIG, timeControl: { ...DEFAULT_CONFIG.timeControl } }
  }
}

export function saveConfig(config: Config): void {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
}

export function mergeConfig(base: Config, patch: Partial<Config>): Config {
  const timeControl = {
    initial: patch.timeControl?.initial ?? base.timeControl.initial,
    increment: patch.timeControl?.increment ?? base.timeControl.increment,
  }
  return {
    userElo: num(patch.userElo, base.userElo),
    opponentElo: num(patch.opponentElo, base.opponentElo),
    thresholdElo: num(patch.thresholdElo, base.thresholdElo),
    tauRatio: num(patch.tauRatio, base.tauRatio),
    tauWdl: num(patch.tauWdl, base.tauWdl),
    wdlClauseEnabled: patch.wdlClauseEnabled ?? base.wdlClauseEnabled,
    maxRetries: num(patch.maxRetries, base.maxRetries),
    freezeClockMode: isFreezeClockMode(patch.freezeClockMode)
      ? patch.freezeClockMode
      : base.freezeClockMode,
    freezePenaltySeconds: num(patch.freezePenaltySeconds, base.freezePenaltySeconds),
    decoyFreezeRate: num(patch.decoyFreezeRate, base.decoyFreezeRate),
    verdictGateMs: num(patch.verdictGateMs, base.verdictGateMs),
    openingSkipPlies: num(patch.openingSkipPlies, base.openingSkipPlies),
    timeControl,
    sfMovetimeMs: num(patch.sfMovetimeMs, base.sfMovetimeMs),
    userColor: isUserColor(patch.userColor) ? patch.userColor : base.userColor,
    maiaVariant: isMaiaVariant(patch.maiaVariant) ? patch.maiaVariant : base.maiaVariant,
  }
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

import { Chess } from 'chess.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createMaiaClient, type MaiaClient } from '../engine/maiaClient'
import { createStockfishClient, type StockfishClient } from '../engine/stockfishClient'
import {
  applyUci,
  isForcingMove,
  isTerminal,
  legalUcis,
  newChess,
  newGameId,
  phaseOf,
  resolveUserColor,
  resultFromBoard,
  toUci,
} from '../lib/chess'
import {
  applyIncrement,
  createClocks,
  deductMs,
  pauseClocks,
  resumeClocks,
  tickClocks,
  type ClockState,
} from '../lib/clocks'
import { combineChannels, maybeDecoy, policyRatio, shouldSkipEval } from '../lib/freeze'
import { moveProb, sampleMove, topMove } from '../lib/maia/decode'
import { isExtremeExpected, userPovExpected } from '../lib/wdl'
import { loadConfig } from '../store/config'
import { putGame, putMove } from '../store/db'
import type { Color, Config } from '../types/config'
import type { FreezeTrigger, GameRecord, MoveRecord, MoveResolved } from '../types/game'

export type PlayStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'evaluating'
  | 'frozen'
  | 'gameover'

export interface FreezeView {
  decoy: boolean
  retries: number
  maxRetries: number
  revealed: { sfBest: string; thresholdTop: string } | null
}

export interface LoadProgress {
  loaded: number
  total: number
  label: string
}

interface PendingPly {
  fenBefore: string
  ply: number
  attempts: string[]
  clockRemainingMs: number
  thinkTimeMs: number
  startedAt: number
  decoyActive: boolean
  originalMove: string | null
  skipDecoy: boolean
  didFreeze: boolean
}

export interface PlayState {
  status: PlayStatus
  fen: string
  userColor: Color
  clocks: ClockState
  freezeCount: number
  freeze: FreezeView | null
  sanMoves: string[]
  lastResult: string
  error: string | null
  loadProgress: LoadProgress | null
  gameId: string | null
}

const initialState = (): PlayState => ({
  status: 'idle',
  fen: new Chess().fen(),
  userColor: 'w',
  clocks: createClocks(180, Date.now()),
  freezeCount: 0,
  freeze: null,
  sanMoves: [],
  lastResult: '*',
  error: null,
  loadProgress: null,
  gameId: null,
})

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function useGame() {
  const [state, setState] = useState<PlayState>(initialState)
  const chessRef = useRef(new Chess())
  const configRef = useRef<Config>(loadConfig())
  const maiaRef = useRef<MaiaClient | null>(null)
  const sfRef = useRef<StockfishClient | null>(null)
  const pendingRef = useRef<PendingPly | null>(null)
  const gameMetaRef = useRef<{ gameId: string; startedAt: number; userColor: Color } | null>(
    null,
  )
  const statusRef = useRef<PlayStatus>('idle')
  const clocksRef = useRef<ClockState>(state.clocks)
  const moveStartRef = useRef<number>(Date.now())
  const evaluatingRef = useRef(false)

  const setStatus = (status: PlayStatus) => {
    statusRef.current = status
    setState((s) => ({ ...s, status }))
  }

  const syncBoard = (patch: Partial<PlayState> = {}) => {
    setState((s) => ({
      ...s,
      fen: chessRef.current.fen(),
      sanMoves: chessRef.current.history(),
      clocks: clocksRef.current,
      ...patch,
    }))
  }

  const endGame = useCallback(async (timedOut?: Color) => {
    const chess = chessRef.current
    const result = resultFromBoard(chess, timedOut)
    clocksRef.current = { ...clocksRef.current, running: null }
    statusRef.current = 'gameover'
    const meta = gameMetaRef.current
    if (meta) {
      const record: GameRecord = {
        gameId: meta.gameId,
        startedAt: meta.startedAt,
        endedAt: Date.now(),
        config: configRef.current,
        pgn: chess.pgn(),
        result,
        userColor: meta.userColor,
      }
      await putGame(record)
    }
    setState((s) => ({
      ...s,
      status: 'gameover',
      lastResult: result,
      fen: chess.fen(),
      sanMoves: chess.history(),
      clocks: clocksRef.current,
      freeze: null,
    }))
  }, [])

  const playOpponent = useCallback(async () => {
    const chess = chessRef.current
    const config = configRef.current
    const meta = gameMetaRef.current
    if (!meta || chess.isGameOver()) {
      await endGame()
      return
    }
    if (chess.turn() === meta.userColor) {
      moveStartRef.current = Date.now()
      clocksRef.current = resumeClocks(clocksRef.current, meta.userColor, Date.now())
      setStatus('playing')
      syncBoard()
      return
    }
    const maia = maiaRef.current
    if (!maia) {
      setState((s) => ({ ...s, error: 'Maia is not loaded', status: 'idle' }))
      return
    }
    const { policy } = await maia.policy(chess.fen(), config.opponentElo, config.userElo)
    const uci = sampleMove(policy)
    applyUci(chess, uci)
    clocksRef.current = applyIncrement(
      clocksRef.current,
      meta.userColor === 'w' ? 'b' : 'w',
      config.timeControl.increment,
    )
    if (chess.isGameOver()) {
      await endGame()
      return
    }
    moveStartRef.current = Date.now()
    clocksRef.current = resumeClocks(clocksRef.current, meta.userColor, Date.now())
    setStatus('playing')
    syncBoard()
  }, [endGame])

  const recordMove = useCallback(async (move: MoveRecord) => {
    await putMove(move)
  }, [])

  const acceptUserMove = useCallback(
    async (
      uci: string,
      extras: {
        ratio: number
        wdlDelta: number
        sfBestMove: string
        thresholdTopMove: string
        trigger: FreezeTrigger
        resolved: MoveResolved
        evaluated: boolean
        isForcing: boolean
      },
    ) => {
      const pending = pendingRef.current
      const chess = chessRef.current
      const config = configRef.current
      const meta = gameMetaRef.current
      if (!pending || !meta) return

      if (chess.fen() === pending.fenBefore) {
        applyUci(chess, uci)
      }

      const attempts = pending.attempts.includes(uci)
        ? pending.attempts
        : [...pending.attempts, uci]
      const retries = Math.max(0, attempts.length - 1)
      const ply = pending.ply
      await recordMove({
        gameId: meta.gameId,
        ply,
        fen: pending.fenBefore,
        userMove: uci,
        attempts,
        ratio: extras.ratio,
        wdlDelta: extras.wdlDelta,
        sfBestMove: extras.sfBestMove,
        thresholdTopMove: extras.thresholdTopMove,
        trigger: extras.trigger,
        retries,
        resolved: extras.resolved,
        clockRemainingMs: pending.clockRemainingMs,
        thinkTimeMs: pending.thinkTimeMs,
        isForcing: extras.isForcing,
        phase: phaseOf(pending.fenBefore, ply),
        evaluated: extras.evaluated,
      })
      if (pending.didFreeze && config.freezeClockMode === 'penalty') {
        const deducted = deductMs(
          clocksRef.current,
          meta.userColor,
          config.freezePenaltySeconds * 1000,
        )
        clocksRef.current = deducted.clocks
        if (deducted.flagged) {
          pendingRef.current = null
          await endGame(deducted.flagged)
          return
        }
      }
      pendingRef.current = null
      clocksRef.current = applyIncrement(
        clocksRef.current,
        meta.userColor,
        config.timeControl.increment,
      )
      if (chess.isGameOver()) {
        await endGame()
        return
      }
      setState((s) => ({ ...s, freeze: null, freezeCount: s.freezeCount }))
      await playOpponent()
    },
    [endGame, playOpponent, recordMove],
  )

  const enterFreeze = useCallback(
    (decoy: boolean) => {
      const config = configRef.current
      const meta = gameMetaRef.current
      const pending = pendingRef.current
      if (!meta || !pending) return
      chessRef.current.load(pending.fenBefore)
      pending.didFreeze = true
      const now = Date.now()
      if (config.freezeClockMode === 'running') {
        clocksRef.current = resumeClocks(clocksRef.current, meta.userColor, now)
      } else {
        clocksRef.current = pauseClocks(clocksRef.current, now)
      }
      statusRef.current = 'frozen'
      const firstFreeze = pending.attempts.length <= 1
      setState((s) => ({
        ...s,
        status: 'frozen',
        freezeCount: decoy || !firstFreeze ? s.freezeCount : s.freezeCount + 1,
        freeze: {
          decoy,
          retries: pending.attempts.length,
          maxRetries: config.maxRetries,
          revealed: null,
        },
        fen: chessRef.current.fen(),
        sanMoves: chessRef.current.history(),
        clocks: clocksRef.current,
      }))
    },
    [],
  )

  const evaluateUserMove = useCallback(
    async (uci: string) => {
      const chess = chessRef.current
      const config = configRef.current
      const meta = gameMetaRef.current
      const maia = maiaRef.current
      if (!meta || !maia || evaluatingRef.current) return
      if (statusRef.current !== 'playing' && statusRef.current !== 'frozen') return
      if (chess.turn() !== meta.userColor) return

      const pendingExisting = pendingRef.current
      if (
        pendingExisting?.decoyActive &&
        pendingExisting.originalMove === uci
      ) {
        evaluatingRef.current = true
        applyUci(chess, uci)
        syncBoard({ status: 'evaluating' })
        await delay(configRef.current.verdictGateMs)
        evaluatingRef.current = false
        await acceptUserMove(uci, {
          ratio: 1,
          wdlDelta: 0,
          sfBestMove: '',
          thresholdTopMove: uci,
          trigger: 'decoy',
          resolved: 'accepted',
          evaluated: true,
          isForcing: isForcingMove(pendingExisting.fenBefore, uci),
        })
        return
      }

      evaluatingRef.current = true
      const fenBefore = chess.fen()
      const ply = chess.history().length
      const legal = legalUcis(chess)
      const thinkTimeMs = Date.now() - moveStartRef.current
      const clockRemainingMs = clocksRef.current[meta.userColor]
      clocksRef.current = pauseClocks(clocksRef.current, Date.now())

      if (!pendingRef.current) {
        pendingRef.current = {
          fenBefore,
          ply,
          attempts: [uci],
          clockRemainingMs,
          thinkTimeMs,
          startedAt: Date.now(),
          decoyActive: false,
          originalMove: uci,
          skipDecoy: false,
          didFreeze: false,
        }
      } else {
        pendingRef.current.attempts.push(uci)
        pendingRef.current.skipDecoy = false
      }

      applyUci(chess, uci)
      statusRef.current = 'evaluating'
      syncBoard({ status: 'evaluating', freeze: null })

      const after = newChess(chess.fen())
      const terminalAfter = isTerminal(after)

      try {
        const cheapSkip = shouldSkipEval({
          ply,
          legalMoveCount: legal.length,
          afterMoveTerminal: terminalAfter,
          openingSkipPlies: config.openingSkipPlies,
          wdlClauseEnabled: false,
        })

        const opponentPromise = terminalAfter
          ? Promise.resolve(null)
          : maia.policy(after.fen(), config.opponentElo, config.userElo)
        const gate = delay(config.verdictGateMs)

        if (cheapSkip) {
          await gate
          evaluatingRef.current = false
          if (terminalAfter) {
            await acceptUserMove(uci, {
              ratio: 0,
              wdlDelta: 0,
              sfBestMove: '',
              thresholdTopMove: '',
              trigger: 'none',
              resolved: 'accepted',
              evaluated: false,
              isForcing: isForcingMove(fenBefore, uci),
            })
            return
          }
          await opponentPromise
          await acceptUserMove(uci, {
            ratio: 0,
            wdlDelta: 0,
            sfBestMove: '',
            thresholdTopMove: '',
            trigger: 'none',
            resolved: 'accepted',
            evaluated: false,
            isForcing: isForcingMove(fenBefore, uci),
          })
          return
        }

        const sf = config.wdlClauseEnabled ? sfRef.current : null
        const thresholdPromise = maia.policy(
          fenBefore,
          config.thresholdElo,
          config.opponentElo,
        )
        const searchBefore = sf
          ? sf.evaluate(fenBefore, config.sfMovetimeMs)
          : Promise.resolve(null)

        const beforeEval = await searchBefore
        const preMoveExpected = beforeEval
          ? userPovExpected(beforeEval.stmExpected, true)
          : undefined

        if (
          beforeEval &&
          preMoveExpected !== undefined &&
          isExtremeExpected(preMoveExpected)
        ) {
          await Promise.all([gate, opponentPromise])
          evaluatingRef.current = false
          await acceptUserMove(uci, {
            ratio: 0,
            wdlDelta: 0,
            sfBestMove: beforeEval.bestMove,
            thresholdTopMove: '',
            trigger: 'none',
            resolved: 'accepted',
            evaluated: false,
            isForcing: isForcingMove(fenBefore, beforeEval.bestMove),
            })
          return
        }

        const afterEval = sf
          ? sf.evaluate(chess.fen(), config.sfMovetimeMs)
          : Promise.resolve(null)

        const [threshold, afterSearch] = await Promise.all([
          thresholdPromise,
          afterEval,
          gate,
          opponentPromise,
        ])

        const policy = threshold.policy
        const top = topMove(policy)
        const ratio = policyRatio(moveProb(policy, uci), top?.p ?? 0)
        let delta = 0
        if (beforeEval && afterSearch) {
          const bestUser = userPovExpected(beforeEval.stmExpected, true)
          const afterUser = userPovExpected(afterSearch.stmExpected, false)
          delta = bestUser - afterUser
        }

        const channel = combineChannels(ratio, delta, config)
        const pending = pendingRef.current
        const skipDecoy = pending?.skipDecoy || pending?.decoyActive
        const decoy =
          !channel.freeze &&
          !skipDecoy &&
          maybeDecoy(true, config.decoyFreezeRate)

        evaluatingRef.current = false

        if (channel.freeze || decoy) {
          const fails = (pending?.attempts.length ?? 1)
          if (channel.freeze && fails >= config.maxRetries) {
            const best = beforeEval?.bestMove || top?.uci || uci
            chess.load(fenBefore)
            applyUci(chess, best)
            setState((s) => ({
              ...s,
              freeze: {
                decoy: false,
                retries: fails,
                maxRetries: config.maxRetries,
                revealed: { sfBest: beforeEval?.bestMove ?? '', thresholdTop: top?.uci ?? '' },
              },
            }))
            await acceptUserMove(best, {
              ratio,
              wdlDelta: delta,
              sfBestMove: beforeEval?.bestMove ?? '',
              thresholdTopMove: top?.uci ?? '',
              trigger: channel.trigger,
              resolved: 'revealed',
              evaluated: true,
              isForcing: isForcingMove(fenBefore, beforeEval?.bestMove ?? best),
            })
            return
          }
          if (pending) {
            pending.decoyActive = decoy && !channel.freeze
            if (decoy && !channel.freeze) pending.originalMove = pending.originalMove ?? uci
          }
          enterFreeze(decoy && !channel.freeze)
          return
        }

        await acceptUserMove(uci, {
          ratio,
          wdlDelta: delta,
          sfBestMove: beforeEval?.bestMove ?? '',
          thresholdTopMove: top?.uci ?? '',
          trigger: 'none',
          resolved: 'accepted',
          evaluated: true,
          isForcing: isForcingMove(fenBefore, beforeEval?.bestMove ?? uci),
        })
      } catch (err) {
        evaluatingRef.current = false
        chess.load(fenBefore)
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : String(err),
          status: 'playing',
          fen: chess.fen(),
        }))
        clocksRef.current = resumeClocks(clocksRef.current, meta.userColor, Date.now())
      }
    },
    [acceptUserMove, enterFreeze],
  )

  const startGame = useCallback(async () => {
    const config = loadConfig()
    configRef.current = config
    setState(() => ({
      ...initialState(),
      status: 'loading',
      loadProgress: { loaded: 0, total: 1, label: 'Loading Maia-3…' },
      error: null,
    }))
    statusRef.current = 'loading'
    try {
      if (!maiaRef.current) maiaRef.current = createMaiaClient()
      await maiaRef.current.load(config.maiaVariant, (loaded, total) => {
        setState((s) => ({
          ...s,
          loadProgress: {
            loaded,
            total: total || loaded,
            label: `Downloading Maia-3 ${config.maiaVariant}…`,
          },
        }))
      })
      if (config.wdlClauseEnabled) {
        setState((s) => ({
          ...s,
          loadProgress: { loaded: 1, total: 1, label: 'Starting Stockfish…' },
        }))
        if (!sfRef.current) sfRef.current = createStockfishClient()
        await sfRef.current.evaluate(new Chess().fen(), 16)
      } else if (sfRef.current) {
        sfRef.current.terminate()
        sfRef.current = null
      }

      const userColor = resolveUserColor(config.userColor)
      const chess = new Chess()
      chessRef.current = chess
      const gameId = newGameId()
      gameMetaRef.current = { gameId, startedAt: Date.now(), userColor }
      pendingRef.current = null
      clocksRef.current = createClocks(config.timeControl.initial, Date.now())
      moveStartRef.current = Date.now()
      setState({
        status: 'playing',
        fen: chess.fen(),
        userColor,
        clocks: clocksRef.current,
        freezeCount: 0,
        freeze: null,
        sanMoves: [],
        lastResult: '*',
        error: null,
        loadProgress: null,
        gameId,
      })
      statusRef.current = 'playing'
      if (chess.turn() !== userColor) {
        clocksRef.current = pauseClocks(clocksRef.current, Date.now())
        await playOpponent()
      } else {
        clocksRef.current = resumeClocks(clocksRef.current, userColor, Date.now())
        syncBoard()
      }
    } catch (err) {
      maiaRef.current?.terminate()
      maiaRef.current = null
      sfRef.current?.terminate()
      sfRef.current = null
      setState((s) => ({
        ...s,
        status: 'idle',
        error: err instanceof Error ? err.message : String(err),
        loadProgress: null,
      }))
    }
  }, [playOpponent])

  const onDrop = useCallback(
    (from: string, to: string, promotion?: string) => {
      if (statusRef.current !== 'playing' && statusRef.current !== 'frozen') return false
      const meta = gameMetaRef.current
      const chess = chessRef.current
      if (!meta || chess.turn() !== meta.userColor) return false
      const uci = toUci(from, to, promotion)
      const probe = newChess(chess.fen())
      if (!applyUci(probe, uci)) return false
      void evaluateUserMove(uci)
      return true
    },
    [evaluateUserMove],
  )

  useEffect(() => {
    const id = window.setInterval(() => {
      if (statusRef.current !== 'playing' && statusRef.current !== 'frozen') return
      const config = configRef.current
      if (statusRef.current === 'frozen' && config.freezeClockMode !== 'running') return
      const { clocks, flagged } = tickClocks(clocksRef.current, Date.now())
      clocksRef.current = clocks
      setState((s) => ({ ...s, clocks }))
      if (flagged) void endGame(flagged)
    }, 100)
    return () => window.clearInterval(id)
  }, [endGame])

  useEffect(() => {
    return () => {
      maiaRef.current?.terminate()
      sfRef.current?.terminate()
    }
  }, [])

  return { state, startGame, onDrop }
}

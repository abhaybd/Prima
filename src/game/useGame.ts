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
  restoreFen,
  resultFromBoard,
  toUci,
} from '../lib/chess'
import {
  applyIncrement,
  createClocks,
  deductMs,
  freezeClockRunsDuringFreeze,
  pauseClocks,
  resumeClocks,
  tickClocks,
  type ClockState,
} from '../lib/clocks'
import { combineChannels, isRealFreezeTrigger, maybeDecoy, policyRatio, skipEvalReason } from '../lib/freeze'
import { loadOpeningBook, type OpeningBook } from '../lib/openingBook'
import { moveProb, sampleMove, topMove } from '../lib/maia/decode'
import { logEvalComment, logGamePgn, pgnWithEvalComments, EVAL_LOG_PREFIX, type EvalComment } from '../lib/pgn'
import { isExtremeExpected, userPovExpected } from '../lib/wdl'
import { loadConfig } from '../store/config'
import { putGame, putMove } from '../store/db'
import { DEFAULT_CONFIG, type Color, type Config, type TimeControl } from '../types/config'
import type { FreezeTrigger, GameRecord, MoveRecord, MoveResolved } from '../types/game'
import type { DebugGameMeta } from '../lib/debug'

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
  hadRealFreeze: boolean
}

export interface PlayState {
  status: PlayStatus
  fen: string
  userColor: Color
  opponentElo: number
  timeControl: TimeControl
  clocks: ClockState
  freezeCount: number
  freeze: FreezeView | null
  sanMoves: string[]
  lastResult: string
  timedOut: Color | null
  error: string | null
  loadProgress: LoadProgress | null
  gameId: string | null
  debugMeta: DebugGameMeta | null
  debugEvals: EvalComment[]
  debugNotes: string[]
}

const initialState = (): PlayState => ({
  status: 'idle',
  fen: new Chess().fen(),
  userColor: 'w',
  opponentElo: DEFAULT_CONFIG.opponentElo,
  timeControl: { ...DEFAULT_CONFIG.timeControl },
  clocks: createClocks(DEFAULT_CONFIG.timeControl.initial, Date.now()),
  freezeCount: 0,
  freeze: null,
  sanMoves: [],
  lastResult: '*',
  timedOut: null,
  error: null,
  loadProgress: null,
  gameId: null,
  debugMeta: null,
  debugEvals: [],
  debugNotes: [],
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
  const evalCommentsRef = useRef<Map<number, string>>(new Map())
  const debugEvalsRef = useRef<EvalComment[]>([])
  const debugNotesRef = useRef<string[]>([])
  const bookRef = useRef<OpeningBook | null>(null)
  const freezeGraceEndsAtRef = useRef<number | null>(null)

  const logEval = (d: EvalComment): string => {
    const text = logEvalComment(d)
    debugEvalsRef.current = [...debugEvalsRef.current, d]
    setState((s) => ({ ...s, debugEvals: debugEvalsRef.current }))
    return text
  }

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
    freezeGraceEndsAtRef.current = null
    evaluatingRef.current = false
    pendingRef.current = null
    statusRef.current = 'gameover'
    setState((s) => ({
      ...s,
      status: 'gameover',
      lastResult: result,
      timedOut: timedOut ?? null,
      fen: chess.fen(),
      sanMoves: chess.history(),
      clocks: clocksRef.current,
      freeze: null,
    }))
    const meta = gameMetaRef.current
    if (!meta) return
    const config = configRef.current
    const pgn = pgnWithEvalComments(chess.history(), evalCommentsRef.current, {
      Event: 'Blitz Freeze Drill',
      White: meta.userColor === 'w' ? 'User' : `Maia ${config.opponentElo}`,
      Black: meta.userColor === 'b' ? 'User' : `Maia ${config.opponentElo}`,
      Result: result,
    })
    logGamePgn(pgn)
    const record: GameRecord = {
      gameId: meta.gameId,
      startedAt: meta.startedAt,
      endedAt: Date.now(),
      config,
      pgn,
      result,
      userColor: meta.userColor,
    }
    await putGame(record)
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
    const { policy } = await maia.policy(chess.fen(), config.opponentElo, config.opponentElo)
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
        evalComment?: EvalComment
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
      if (extras.evalComment) {
        const text = logEval({
          ...extras.evalComment,
          ply,
          uci,
          attempts,
          retries,
          resolved: extras.resolved,
        })
        evalCommentsRef.current.set(ply, text)
      }
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
        hadRealFreeze: pending.hadRealFreeze || isRealFreezeTrigger(extras.trigger),
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
          freezeGraceEndsAtRef.current = null
          await endGame(deducted.flagged)
          return
        }
      }
      pendingRef.current = null
      freezeGraceEndsAtRef.current = null
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
      restoreFen(chessRef.current, pending.fenBefore)
      pending.didFreeze = true
      const now = Date.now()
      if (
        config.freezeClockMode === 'grace' &&
        freezeGraceEndsAtRef.current === null
      ) {
        freezeGraceEndsAtRef.current = now + config.freezeGraceSeconds * 1000
      }
      if (
        freezeClockRunsDuringFreeze(
          config.freezeClockMode,
          now,
          freezeGraceEndsAtRef.current,
        )
      ) {
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
          evalComment: {
            ply: pendingExisting.ply,
            uci,
            evaluated: true,
            trigger: 'decoy',
            freeze: false,
            ratio: 1,
            wdlDelta: 0,
            thresholdTopMove: uci,
            tauRatio: config.tauRatio,
            tauWdl: config.tauWdl,
            wdlClauseEnabled: config.wdlClauseEnabled,
          },
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
          hadRealFreeze: false,
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
        const skip = skipEvalReason({
          legalMoveCount: legal.length,
          afterMoveTerminal: terminalAfter,
          inOpeningBook: bookRef.current?.hasFen(chess.fen()) ?? false,
          wdlClauseEnabled: false,
        })
        const tau = {
          tauRatio: config.tauRatio,
          tauWdl: config.tauWdl,
          wdlClauseEnabled: config.wdlClauseEnabled,
        }

        const opponentPromise = terminalAfter
          ? Promise.resolve(null)
          : maia.policy(after.fen(), config.opponentElo, config.opponentElo)
        const gate = delay(config.verdictGateMs)

        if (skip) {
          await gate
          evaluatingRef.current = false
          const skipped: EvalComment = {
            ply,
            uci,
            evaluated: false,
            skipReason: skip,
            trigger: 'none',
            freeze: false,
            ratio: 0,
            wdlDelta: 0,
            ...tau,
          }
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
              evalComment: skipped,
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
            evalComment: skipped,
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
            evalComment: {
              ply,
              uci,
              evaluated: false,
              skipReason: 'extreme-wdl',
              trigger: 'none',
              freeze: false,
              ratio: 0,
              wdlDelta: 0,
              eBest: preMoveExpected,
              wdlStm: beforeEval.wdl,
              sfBestMove: beforeEval.bestMove,
              ...tau,
            },
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
        const pMove = moveProb(policy, uci)
        const pTop = top?.p ?? 0
        const ratio = policyRatio(pMove, pTop)
        let eBest: number | undefined
        let eAfter: number | undefined
        let delta = 0
        if (beforeEval && afterSearch) {
          eBest = userPovExpected(beforeEval.stmExpected, true)
          eAfter = userPovExpected(afterSearch.stmExpected, false)
          delta = eBest - eAfter
        }

        const channel = combineChannels(ratio, delta, config)
        const pending = pendingRef.current
        const skipDecoy = pending?.skipDecoy || pending?.decoyActive
        const decoy =
          !channel.freeze &&
          !skipDecoy &&
          maybeDecoy(true, config.decoyFreezeRate)

        evaluatingRef.current = false

        const evalComment: EvalComment = {
          ply,
          uci,
          evaluated: true,
          pMove,
          pTop,
          ratio,
          eBest,
          eAfter,
          wdlDelta: delta,
          wdlStm: beforeEval?.wdl,
          wdlAfterStm: afterSearch?.wdl,
          trigger: decoy && !channel.freeze ? 'decoy' : channel.trigger,
          freeze: channel.freeze || decoy,
          sfBestMove: beforeEval?.bestMove ?? '',
          thresholdTopMove: top?.uci ?? '',
          ...tau,
        }

        if (channel.freeze || decoy) {
          if (pending && channel.freeze) pending.hadRealFreeze = true
          const fails = (pending?.attempts.length ?? 1)
          if (channel.freeze && fails >= config.maxRetries) {
            const best = beforeEval?.bestMove || top?.uci || uci
            restoreFen(chess, fenBefore)
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
              evalComment: { ...evalComment, uci: best, freeze: true, trigger: channel.trigger },
            })
            return
          }
          if (pending) {
            pending.decoyActive = decoy && !channel.freeze
            if (decoy && !channel.freeze) pending.originalMove = pending.originalMove ?? uci
          }
          logEval({
            ...evalComment,
            attempts: pending?.attempts,
            retries: Math.max(0, (pending?.attempts.length ?? 1) - 1),
          })
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
          evalComment: { ...evalComment, freeze: false, trigger: 'none' },
        })
      } catch (err) {
        evaluatingRef.current = false
        restoreFen(chess, fenBefore)
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : String(err),
          status: 'playing',
          fen: chess.fen(),
          sanMoves: chess.history(),
        }))
        clocksRef.current = resumeClocks(clocksRef.current, meta.userColor, Date.now())
      }
    },
    [acceptUserMove, enterFreeze],
  )

  const startGame = useCallback(async () => {
    const config = loadConfig()
    configRef.current = config
    setState((s) => ({
      ...initialState(),
      status: 'loading',
      loadProgress: { loaded: 0, total: 1, label: 'Loading Maia-3…' },
      error: null,
      userColor: s.userColor,
      opponentElo: s.opponentElo,
      timeControl: s.timeControl,
      gameId: s.gameId,
    }))
    statusRef.current = 'loading'
    debugEvalsRef.current = []
    debugNotesRef.current = []
    try {
      const bookPromise = loadOpeningBook().catch((err) => {
        console.warn(EVAL_LOG_PREFIX, 'opening book failed', err)
        debugNotesRef.current = [
          ...debugNotesRef.current,
          `opening book failed ${err instanceof Error ? err.message : String(err)}`,
        ]
        return null
      })
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

      bookRef.current = await bookPromise
      const userColor = resolveUserColor(config.userColor)
      const chess = new Chess()
      chessRef.current = chess
      const gameId = newGameId()
      gameMetaRef.current = { gameId, startedAt: Date.now(), userColor }
      pendingRef.current = null
      evalCommentsRef.current = new Map()
      freezeGraceEndsAtRef.current = null
      clocksRef.current = createClocks(config.timeControl.initial, Date.now())
      moveStartRef.current = Date.now()
      const startLine = `game ${gameId} user=${userColor} tauR=${config.tauRatio} tauW=${config.tauWdl} wdlOn=${config.wdlClauseEnabled ? 'yes' : 'no'} book=${bookRef.current?.size ?? 0} thresholdElo=${config.thresholdElo} opponentElo=${config.opponentElo}`
      console.info(EVAL_LOG_PREFIX, startLine)
      const debugMeta: DebugGameMeta = {
        gameId,
        userColor,
        tauRatio: config.tauRatio,
        tauWdl: config.tauWdl,
        wdlOn: config.wdlClauseEnabled,
        bookSize: bookRef.current?.size ?? 0,
        thresholdElo: config.thresholdElo,
        opponentElo: config.opponentElo,
      }
      setState({
        status: 'playing',
        fen: chess.fen(),
        userColor,
        opponentElo: config.opponentElo,
        timeControl: { ...config.timeControl },
        clocks: clocksRef.current,
        freezeCount: 0,
        freeze: null,
        sanMoves: [],
        lastResult: '*',
        timedOut: null,
        error: null,
        loadProgress: null,
        gameId,
        debugMeta,
        debugEvals: [],
        debugNotes: debugNotesRef.current,
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
      const message = err instanceof Error ? err.message : String(err)
      debugNotesRef.current = [...debugNotesRef.current, message]
      setState((s) => ({
        ...s,
        status: 'idle',
        error: message,
        loadProgress: null,
        debugNotes: debugNotesRef.current,
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
      const now = Date.now()
      if (statusRef.current === 'frozen') {
        const shouldRun = freezeClockRunsDuringFreeze(
          config.freezeClockMode,
          now,
          freezeGraceEndsAtRef.current,
        )
        if (!shouldRun) return
        const meta = gameMetaRef.current
        if (meta && !clocksRef.current.running) {
          clocksRef.current = resumeClocks(clocksRef.current, meta.userColor, now)
        }
      }
      const { clocks, flagged } = tickClocks(clocksRef.current, now)
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

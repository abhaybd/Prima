import { Chess } from 'chess.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createMaiaClient, type MaiaClient, type PolicyResult } from '../engine/maiaClient'
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
import { commitAttempts, freezeVerdict, isGameDecided, isRealFreezeTrigger, maybeDecoy, policyRatio, recordedTrigger, skipEvalReason } from '../lib/freeze'
import { loadOpeningBook, type OpeningBook } from '../lib/openingBook'
import { chooseOpponentMove, moveProb, topMove } from '../lib/maia/decode'
import { logEvalComment, logGamePgn, pgnWithEvalComments, EVAL_LOG_PREFIX, type EvalComment } from '../lib/pgn'
import { evalFromCheckmate } from '../lib/sfEval'
import { loadConfig } from '../store/config'
import { putGame, putMove } from '../store/db'
import { DEFAULT_CONFIG, type Color, type Config, type TimeControl } from '../types/config'
import type { FreezeTrigger, GameRecord, MoveRecord, MoveResolved, SfEval, SfEvalPoint } from '../types/game'
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
  revealed: { thresholdTop: string } | null
}

export interface LoadProgress {
  loaded: number
  total: number
  label: string
}

interface UserTurnPrefetch {
  fen: string
  sfBefore: Promise<SfEval | null>
  expert: Promise<PolicyResult | null>
}

interface PendingPly {
  fenBefore: string
  ply: number
  attempts: string[]
  attemptRatios: number[]
  clockRemainingMs: number
  thinkTimeMs: number
  startedAt: number
  decoyActive: boolean
  originalMove: string | null
  skipDecoy: boolean
  didFreeze: boolean
  hadRealFreeze: boolean
  hadDecoy: boolean
  revealedTop: string | null
}

function stampAttemptRatio(pending: PendingPly | null, ratio: number): void {
  if (!pending || pending.attempts.length === 0) return
  pending.attemptRatios[pending.attempts.length - 1] = ratio
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

export function useGame() {
  const [state, setState] = useState<PlayState>(initialState)
  const chessRef = useRef(new Chess())
  const configRef = useRef<Config>(loadConfig())
  const maiaRef = useRef<MaiaClient | null>(null)
  const sfRef = useRef<StockfishClient | null>(null)
  const sfGenRef = useRef(0)
  const sfEvalsRef = useRef<SfEvalPoint[]>([])
  const sfPendingRef = useRef<Promise<void>[]>([])
  const sfPlyTasksRef = useRef<Map<number, Promise<SfEval | null>>>(new Map())
  const prefetchRef = useRef<UserTurnPrefetch | null>(null)
  const savedMovesRef = useRef<Map<number, MoveRecord>>(new Map())
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

  const applySfPoint = (ply: number, ev: SfEval, isUserPly: boolean) => {
    const point: SfEvalPoint = { ply, pawns: ev.pawns }
    if (ev.mate != null) point.mate = ev.mate
    sfEvalsRef.current = [...sfEvalsRef.current.filter((p) => p.ply !== ply), point].sort(
      (a, b) => a.ply - b.ply,
    )
    if (!isUserPly) return
    const prev = savedMovesRef.current.get(ply)
    if (!prev) return
    const updated: MoveRecord = { ...prev, sfEval: point.pawns }
    if (point.mate != null) updated.sfMate = point.mate
    savedMovesRef.current.set(ply, updated)
    void putMove(updated)
  }

  const sfEvalOnly = async (fen: string): Promise<SfEval | null> => {
    const board = newChess(fen)
    if (board.isCheckmate()) return evalFromCheckmate(board.turn())
    const sf = sfRef.current
    if (!sf) return null
    const gen = sfGenRef.current
    const gameId = gameMetaRef.current?.gameId
    try {
      const ev = await sf.evaluate(fen)
      if (sfGenRef.current !== gen || gameMetaRef.current?.gameId !== gameId) return null
      return ev.mate != null ? { pawns: ev.pawns, mate: ev.mate } : { pawns: ev.pawns }
    } catch (err) {
      console.warn(EVAL_LOG_PREFIX, 'stockfish eval failed', err)
      return null
    }
  }

  const queueSfEval = (ply: number, fenAfter: string, isUserPly: boolean): Promise<SfEval | null> => {
    const existing = sfPlyTasksRef.current.get(ply)
    if (existing) return existing
    const after = newChess(fenAfter)
    if (after.isCheckmate()) {
      const point = evalFromCheckmate(after.turn())
      applySfPoint(ply, point, isUserPly)
      const done = Promise.resolve(point)
      sfPlyTasksRef.current.set(ply, done)
      return done
    }
    const sf = sfRef.current
    if (!sf) {
      const empty = Promise.resolve(null)
      sfPlyTasksRef.current.set(ply, empty)
      return empty
    }
    const gen = sfGenRef.current
    const gameId = gameMetaRef.current?.gameId
    const task = sf
      .evaluate(fenAfter)
      .then(async (ev) => {
        if (sfGenRef.current !== gen || gameMetaRef.current?.gameId !== gameId) return null
        const point: SfEval = ev.mate != null ? { pawns: ev.pawns, mate: ev.mate } : { pawns: ev.pawns }
        applySfPoint(ply, point, isUserPly)
        return point
      })
      .catch((err) => {
        console.warn(EVAL_LOG_PREFIX, 'stockfish eval failed', err)
        return null
      })
    sfPlyTasksRef.current.set(ply, task)
    sfPendingRef.current.push(task.then(() => undefined))
    return task
  }

  const ensureSfPly = (ply: number, fen: string, isUserPly: boolean): Promise<SfEval | null> => {
    const have = sfEvalsRef.current.find((p) => p.ply === ply)
    if (have) return Promise.resolve(have)
    return queueSfEval(ply, fen, isUserPly)
  }

  const prefetchUserTurn = () => {
    const chess = chessRef.current
    const fen = chess.fen()
    if (prefetchRef.current?.fen === fen) return
    const maia = maiaRef.current
    const config = configRef.current
    const lastPly = chess.history().length - 1
    const sfBefore = lastPly >= 0 ? ensureSfPly(lastPly, fen, false) : sfEvalOnly(fen)
    const expert = maia
      ? maia.policy(fen, config.thresholdElo, config.opponentElo).catch((err) => {
          console.warn(EVAL_LOG_PREFIX, 'expert prefetch failed', err)
          return null
        })
      : Promise.resolve(null)
    prefetchRef.current = { fen, sfBefore, expert }
  }

  const flushSfEvals = async (): Promise<SfEvalPoint[]> => {
    const pending = sfPendingRef.current
    sfPendingRef.current = []
    if (pending.length) await Promise.allSettled(pending)
    return [...sfEvalsRef.current].sort((a, b) => a.ply - b.ply)
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
      Event: 'Prima',
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
    const sfEvals = await flushSfEvals()
    if (sfEvals.length > 0) await putGame({ ...record, sfEvals })
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
      prefetchUserTurn()
      return
    }
    const maia = maiaRef.current
    if (!maia) {
      setState((s) => ({ ...s, error: 'Maia is not loaded', status: 'idle' }))
      return
    }
    const { policy } = await maia.policy(chess.fen(), config.opponentElo, config.opponentElo)
    const uci = chooseOpponentMove(policy, config.opponentSampleMode, config.opponentTopP)
    applyUci(chess, uci)
    queueSfEval(chess.history().length - 1, chess.fen(), false)
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
    prefetchUserTurn()
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
        sfAfter?: SfEval
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

      const { attempts, attemptRatios } = commitAttempts(
        pending.attempts,
        pending.attemptRatios,
        uci,
        extras.ratio,
      )
      const retries = Math.max(0, attempts.length - 1)
      const ply = pending.ply
      const hadRealFreeze = pending.hadRealFreeze || isRealFreezeTrigger(extras.trigger)
      const trigger = recordedTrigger(extras.trigger, pending.hadDecoy, hadRealFreeze)
      if (extras.evalComment) {
        const text = logEval({
          ...extras.evalComment,
          ply,
          uci,
          attempts,
          retries,
          resolved: extras.resolved,
          trigger,
        })
        evalCommentsRef.current.set(ply, text)
      }
      const move: MoveRecord = {
        gameId: meta.gameId,
        ply,
        fen: pending.fenBefore,
        userMove: uci,
        attempts,
        attemptRatios,
        ratio: extras.ratio,
        wdlDelta: extras.wdlDelta,
        sfBestMove: extras.sfBestMove,
        thresholdTopMove: extras.thresholdTopMove,
        trigger,
        retries,
        resolved: extras.resolved,
        clockRemainingMs: pending.clockRemainingMs,
        thinkTimeMs: pending.thinkTimeMs,
        isForcing: extras.isForcing,
        phase: phaseOf(pending.fenBefore, ply),
        evaluated: extras.evaluated,
        hadRealFreeze,
      }
      const afterEval = chess.isCheckmate()
        ? evalFromCheckmate(chess.turn())
        : extras.sfAfter
      if (afterEval) {
        move.sfEval = afterEval.pawns
        if (afterEval.mate != null) move.sfMate = afterEval.mate
      }
      await recordMove(move)
      savedMovesRef.current.set(ply, move)
      if (afterEval) applySfPoint(ply, afterEval, false)
      else queueSfEval(ply, chess.fen(), true)
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
    (decoy: boolean, revealed: FreezeView['revealed'] = null) => {
      const config = configRef.current
      const meta = gameMetaRef.current
      const pending = pendingRef.current
      if (!meta || !pending) return
      restoreFen(chessRef.current, pending.fenBefore)
      pending.didFreeze = true
      if (revealed) pending.revealedTop = revealed.thresholdTop
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
          revealed,
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
            thresholdTopMove: uci,
            tauRatio: config.tauRatio,
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
          attemptRatios: [],
          clockRemainingMs,
          thinkTimeMs,
          startedAt: Date.now(),
          decoyActive: false,
          originalMove: uci,
          skipDecoy: false,
          didFreeze: false,
          hadRealFreeze: false,
          hadDecoy: false,
          revealedTop: null,
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
        })

        const opponentPromise = terminalAfter
          ? Promise.resolve(null)
          : maia.policy(after.fen(), config.opponentElo, config.opponentElo)

        if (skip) {
          evaluatingRef.current = false
          stampAttemptRatio(pendingRef.current, 0)
          const revealed = Boolean(pendingRef.current?.revealedTop)
          const skipped: EvalComment = {
            ply,
            uci,
            evaluated: false,
            skipReason: skip,
            trigger: 'none',
            freeze: false,
            ratio: 0,
            tauRatio: config.tauRatio,
          }
          if (terminalAfter) {
            await acceptUserMove(uci, {
              ratio: 0,
              wdlDelta: 0,
              sfBestMove: '',
              thresholdTopMove: pendingRef.current?.revealedTop ?? '',
              trigger: 'none',
              resolved: revealed ? 'revealed' : 'accepted',
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
            thresholdTopMove: pendingRef.current?.revealedTop ?? '',
            trigger: 'none',
            resolved: revealed ? 'revealed' : 'accepted',
            evaluated: false,
            isForcing: isForcingMove(fenBefore, uci),
            evalComment: skipped,
          })
          return
        }

        const prefetch = prefetchRef.current?.fen === fenBefore ? prefetchRef.current : null
        const beforeEval = prefetch
          ? await prefetch.sfBefore
          : ply > 0
            ? await ensureSfPly(ply - 1, fenBefore, false)
            : await sfEvalOnly(fenBefore)

        let sfAfter: SfEval | undefined
        if (
          beforeEval &&
          config.gameDecidedThreshold > 0 &&
          Math.abs(beforeEval.pawns) >= config.gameDecidedThreshold
        ) {
          const afterEval = await sfEvalOnly(chess.fen())
          if (afterEval) sfAfter = afterEval
          if (isGameDecided(beforeEval.pawns, afterEval?.pawns, config.gameDecidedThreshold)) {
            evaluatingRef.current = false
            stampAttemptRatio(pendingRef.current, 0)
            const revealed = Boolean(pendingRef.current?.revealedTop)
            const skipped: EvalComment = {
              ply,
              uci,
              evaluated: false,
              skipReason: 'decided',
              trigger: 'none',
              freeze: false,
              ratio: 0,
              tauRatio: config.tauRatio,
            }
            await opponentPromise
            await acceptUserMove(uci, {
              ratio: 0,
              wdlDelta: 0,
              sfBestMove: '',
              thresholdTopMove: pendingRef.current?.revealedTop ?? '',
              trigger: 'none',
              resolved: revealed ? 'revealed' : 'accepted',
              evaluated: false,
              isForcing: isForcingMove(fenBefore, uci),
              evalComment: skipped,
              sfAfter,
            })
            return
          }
        }

        const expertPromise = prefetch?.expert ?? maia.policy(
          fenBefore,
          config.thresholdElo,
          config.opponentElo,
        )
        const [thresholdResult] = await Promise.all([expertPromise, opponentPromise])
        const threshold = thresholdResult ?? await maia.policy(
          fenBefore,
          config.thresholdElo,
          config.opponentElo,
        )

        const policy = threshold.policy
        const top = topMove(policy)
        const pMove = moveProb(policy, uci)
        const pTop = top?.p ?? 0
        const ratio = policyRatio(pMove, pTop)
        stampAttemptRatio(pendingRef.current, ratio)
        const channel = freezeVerdict(ratio, config.tauRatio)
        const pending = pendingRef.current
        const alreadyRevealed = Boolean(pending?.revealedTop)
        const skipDecoy = alreadyRevealed || pending?.skipDecoy || pending?.decoyActive
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
          trigger: decoy && !channel.freeze ? 'decoy' : channel.trigger,
          freeze: channel.freeze || decoy,
          thresholdTopMove: top?.uci ?? '',
          tauRatio: config.tauRatio,
        }

        if (alreadyRevealed) {
          if (pending && channel.freeze) pending.hadRealFreeze = true
          const trigger = isRealFreezeTrigger(channel.trigger)
            ? channel.trigger
            : pending?.hadRealFreeze
              ? 'ratio'
              : channel.trigger
          await acceptUserMove(uci, {
            ratio,
            wdlDelta: 0,
            sfBestMove: '',
            thresholdTopMove: pending?.revealedTop || top?.uci || '',
            trigger,
            resolved: 'revealed',
            evaluated: true,
            isForcing: isForcingMove(fenBefore, uci),
            evalComment: { ...evalComment, freeze: channel.freeze, trigger },
            sfAfter,
          })
          return
        }

        if (channel.freeze || decoy) {
          if (pending && channel.freeze) pending.hadRealFreeze = true
          const fails = pending?.attempts.length ?? 1
          if (channel.freeze && fails >= config.maxRetries) {
            logEval({
              ...evalComment,
              attempts: pending?.attempts,
              retries: Math.max(0, fails - 1),
            })
            enterFreeze(false, { thresholdTop: top?.uci ?? '' })
            return
          }
          if (pending) {
            pending.decoyActive = decoy && !channel.freeze
            if (decoy && !channel.freeze) {
              pending.hadDecoy = true
              pending.originalMove = pending.originalMove ?? uci
            }
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
          wdlDelta: 0,
          sfBestMove: '',
          thresholdTopMove: top?.uci ?? '',
          trigger: 'none',
          resolved: 'accepted',
          evaluated: true,
          isForcing: isForcingMove(fenBefore, uci),
          evalComment: { ...evalComment, freeze: false, trigger: 'none' },
          sfAfter,
        })
      } catch (err) {
        evaluatingRef.current = false
        restoreFen(chess, fenBefore)
        const revealedTop = pendingRef.current?.revealedTop
        const message = err instanceof Error ? err.message : String(err)
        if (revealedTop) {
          enterFreeze(false, { thresholdTop: revealedTop })
          setState((s) => ({ ...s, error: message }))
          return
        }
        setState((s) => ({
          ...s,
          error: message,
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
    sfGenRef.current += 1
    sfEvalsRef.current = []
    sfPlyTasksRef.current = new Map()
    prefetchRef.current = null
    savedMovesRef.current = new Map()
    if (!sfRef.current) {
      sfRef.current = createStockfishClient()
      void sfRef.current.evaluate(new Chess().fen()).catch(() => {})
    }
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
      const startLine = `game ${gameId} user=${userColor} minOpt=${(config.tauRatio * 100).toFixed(0)}% decided=${config.gameDecidedThreshold} book=${bookRef.current?.size ?? 0} expertElo=${config.thresholdElo} opponentElo=${config.opponentElo}`
      console.info(EVAL_LOG_PREFIX, startLine)
      const debugMeta: DebugGameMeta = {
        gameId,
        userColor,
        tauRatio: config.tauRatio,
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
        prefetchUserTurn()
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

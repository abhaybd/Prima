import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { newChess, parseUci } from '../lib/chess'
import styles from './Board.module.css'

interface Props {
  fen: string
  orientation: 'white' | 'black'
  interactive: boolean
  hintUci?: string | null
  onMove: (from: string, to: string, promotion?: string) => boolean
}

function tapNeedsPromotion(fen: string, from: string, to: string): boolean {
  try {
    return newChess(fen)
      .moves({ square: from as Square, verbose: true })
      .some((m) => m.to === to && Boolean(m.promotion))
  } catch {
    return false
  }
}

export function Board({ fen, orientation, interactive, hintUci, onMove }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [boardWidth, setBoardWidth] = useState(0)
  const [fromSquare, setFromSquare] = useState<string | null>(null)
  const [pendingPromo, setPendingPromo] = useState<{ from: string; to: string } | null>(null)
  const hint = hintUci ? parseUci(hintUci) : null

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const apply = () => {
      const next = Math.floor(el.getBoundingClientRect().width)
      if (next > 0) setBoardWidth(next)
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    setFromSquare(null)
    setPendingPromo(null)
  }, [fen, interactive])

  return (
    <div ref={wrapRef} className={styles.wrap}>
      {boardWidth > 0 ? (
        <Chessboard
          position={fen}
          boardWidth={boardWidth}
          boardOrientation={orientation}
          arePiecesDraggable={interactive}
          customArrows={hint ? [[hint.from, hint.to, '#f0c14b']] : []}
          customSquareStyles={
            fromSquare ? { [fromSquare]: { backgroundColor: 'rgba(240, 193, 75, 0.45)' } } : {}
          }
          showPromotionDialog={Boolean(pendingPromo)}
          promotionToSquare={(pendingPromo?.to as Square | undefined) ?? null}
          onSquareClick={(square, piece) => {
            if (!interactive) return
            if (!fromSquare) {
              if (piece) setFromSquare(square)
              return
            }
            if (fromSquare === square) {
              setFromSquare(null)
              return
            }
            if (tapNeedsPromotion(fen, fromSquare, square)) {
              setPendingPromo({ from: fromSquare, to: square })
              return
            }
            if (onMove(fromSquare, square)) setFromSquare(null)
            else setFromSquare(piece ? square : null)
          }}
          onPieceDrop={(source, target) => {
            if (!interactive) return false
            return onMove(source, target)
          }}
          onPromotionPieceSelect={(piece, from, to) => {
            const tap = pendingPromo
            const src = from ?? tap?.from
            const dst = to ?? tap?.to
            setPendingPromo(null)
            if (!interactive || !piece || !src || !dst) return false
            const ok = onMove(src, dst, piece[1]?.toLowerCase())
            if (ok) setFromSquare(null)
            return ok && !tap
          }}
          animationDuration={150}
          customBoardStyle={{ borderRadius: 4 }}
          customDarkSquareStyle={{ backgroundColor: '#3d5a4c' }}
          customLightSquareStyle={{ backgroundColor: '#e8eddf' }}
        />
      ) : null}
    </div>
  )
}

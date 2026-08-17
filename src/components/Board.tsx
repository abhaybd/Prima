import { Chessboard } from 'react-chessboard'
import { parseUci } from '../lib/chess'
import styles from './Board.module.css'

interface Props {
  fen: string
  orientation: 'white' | 'black'
  interactive: boolean
  hintUci?: string | null
  onMove: (from: string, to: string, promotion?: string) => boolean
}

export function Board({ fen, orientation, interactive, hintUci, onMove }: Props) {
  const hint = hintUci ? parseUci(hintUci) : null
  return (
    <div className={styles.wrap}>
      <Chessboard
        position={fen}
        boardOrientation={orientation}
        arePiecesDraggable={interactive}
        customArrows={hint ? [[hint.from, hint.to, '#f0c14b']] : []}
        onPieceDrop={(source, target) => {
          if (!interactive) return false
          return onMove(source, target)
        }}
        onPromotionPieceSelect={(piece, from, to) => {
          if (!interactive || !piece || !from || !to) return false
          return onMove(from, to, piece[1]?.toLowerCase())
        }}
        animationDuration={150}
        customBoardStyle={{ borderRadius: 4 }}
        customDarkSquareStyle={{ backgroundColor: '#3d5a4c' }}
        customLightSquareStyle={{ backgroundColor: '#e8eddf' }}
      />
    </div>
  )
}
